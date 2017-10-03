const Router = require('koa-router');
const ajv = new (require('ajv'))({ $data: true });
const logger = require('winston');
require('ajv-keywords')(ajv, 'select');
const jwt = require('jsonwebtoken');
const url = require('url');
const {validate} = require('./utils');

const sessionTokenExpire = 120,     // 2min
  emailTokenExpire = 7 * 24 * 3600, // 7day
  jwtExpire = '7d';                 // 7day

const authSchema = ajv.compile({
  type: 'object',
  required: ['strategy'],
  properties: {
    strategy: {type: 'string', enum: ['local', 'jwt', 'session']}
  },
  select: {$data: '0/strategy'},
  selectCases: {
    local: {
      required: ['payload'],
      anyOf: [{
        properties: {
          strategy: {},
          payload: {
            type: 'object',
            required: ['username', 'password'],
            properties: {
              username: {type: 'string'},
              password: {type: 'string'},
              jwt: {type: 'string'}
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }, {
        properties: {
          strategy: {},
          payload: {
            type: 'object',
            required: ['studentId', 'password'],
            properties: {
              studentId: {type: 'string'},
              password: {type: 'string'},
              jwt: {type: 'string'}
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }]
    },
    jwt: {
      required: ['payload'],
      properties: {
        strategy: {},
        payload: {type: 'string'}
      },
      additionalProperties: false
    },
    session: {
      required: ['payload'],
      properties: {
        strategy: {},
        payload: {
          type: 'object',
          required: ['token'],
          properties: {
            token: {type: 'string'},
            jwt: {type: 'string'}
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  selectDefault: false
});

async function authenticate(ctx) {
  const body = ctx.request.body,
    {global, users, wechatUsers, session} = ctx.models,
    secretKey = await global.getSecretKey();
  validate(ctx, authSchema, body);
  let token, decoded = {}, user = null, wechatUser = null;
  if (body.strategy === 'jwt')
    token = body.payload;
  else
    token = body.payload.jwt;
  if (token) {
    try {
      decoded = await new Promise(function (resolve, reject) {
        jwt.verify(token, secretKey,
          function (err, decoded) {
            if (err)
              reject(err);
            else
              resolve(decoded);
          });
      });
      delete decoded.exp;
      delete decoded.iat;
    } catch (err) {
      if (err.name !== 'TokenExpiredError')
        ctx.throw(401, JSON.stringify({
          code: 401,
          type: 'EAUTH',
          message: err.message
        }));
    }
  }
  switch (body.strategy) {
    case 'local':
      const password = body.payload.password;
      delete body.payload.password;
      user = await users.findOne(body.payload);
      ctx.assert(user, 401, JSON.stringify({
        code: 401,
        type: 'EAUTH',
        message: 'User does not exists',
      }));
      ctx.assert(user.password, 401, JSON.stringify({
        code: 401,
        type: 'EAUTH',
        message: 'Require password reset',
      }));
      ctx.assert(await user.checkPassword(password), 401, JSON.stringify({
        code: 401,
        type: 'EAUTH',
        message: 'Wrong password',
      }));
      decoded.uid = user._id;
      decoded.role = user.role;
      break;
    case 'session':
      const sess = await session.loadAndRemove(body.payload.token);
      ctx.assert(sess, 401, JSON.stringify({
        code: 401,
        type: 'EAUTH',
        message: 'Wrong token',
      }));
      // TODO: remove session
      decoded.uid = sess.uid;
      decoded.wid = sess.wid;
      break;
  }
  if (decoded.uid && !user) {
    user = await users.findOne({_id: decoded.uid});
    decoded.role = user.role;
    if (!decoded.wid && user.wechatId)
      decoded.wid = user.wechatId;
  }
  if (decoded.wid && !wechatUser) {
    wechatUser = await wechatUsers.findOne({openId: decoded.wid});
    if (!decoded.uid && wechatUsers.userId) {
      decoded.uid = wechatUsers.userId;
      user = await users.findOne({_id: decoded.uid});
      decoded.role = user.role;
    }
  }
  const data = {
    token: await new Promise(function (resolve, reject) {
      jwt.sign(decoded, secretKey, {expiresIn: jwtExpire},
        function(err, token) {
          if (err)
            reject(err);
          else
            resolve(token);
        });
    })
  };
  if (user)
    data.user = user.toPlainObject();
  if (wechatUser)
    data.wechatUser = wechatUser.toPlainObject();
  ctx.body = {
    code: 200,
    type: 'OK',
    data
  };
}

const wechatActionMap = {
    register: '/register'
  }, wechatActions = Object.keys(wechatActionMap);
const emailActionMap = {
    register: '/register'
  }, emailActions = Object.keys(emailActionMap);

const oauthSchema = ajv.compile({
  type: 'object',
  required: ['code', 'state', 'action'],
  properties: {
    code: {type: 'string'},
    state: {type: 'string'},
    action: {type: 'string', enum: wechatActions}
  },
  additionalProperties: false
});

async function wechatOAuth(ctx) {
  const query = ctx.query;
  validate(ctx, oauthSchema, query);
  const to = new url.URL(wechatActionMap[query.action], ctx.config.site),
    wechat = ctx.models.global.getWechat(),
    wechatOAuth = ctx.models.wechatOAuth.getOAuth(),
    {wechatUsers, session} = ctx.models;
  const openId = (await wechatOAuth.getAccessToken(query.code)).data.openid,
    token = session.constructor.genToken();
  await session.save(token, {wid: openId}, sessionTokenExpire);
  to.searchParams.set('token', token);
  ctx.redirect(String(to));
  (async () => {
    let document = await wechatUsers.findOne({openId});
    if (document === null) {
      document = new wechatUsers({openId});
      Object.assign(document, await wechatUsers.mapWechat(await wechat.getUser(openId)));
      await document.save();
      logger.info(`Update user's WeChat record: ${openId}`)
    }
  })().catch(function (err) {
    logger.error(`Failed to update user's info`);
    logger.error(err);
  });
}

const sendEmailSchema = ajv.compile({
  type: 'object',
  required: ['emailUser', 'emailServer', 'action'],
  properties: {
    emailUser: {
      type: 'string',
      pattern: "^(([^<>()\\[\\]\\\\.,;:\\s@\"]+" +
               "(\\.[^<>()\\[\\]\\\\.,;:\\s@\"]+)*)|(\".+\"))$"
    },
    emailServer: {type: 'string', enum: [
      'mails.tsinghua.edu.cn',
      'mail.tsinghua.edu.cn'
    ]},
    action: {type: 'string', enum: emailActions}
  },
  additionalProperties: false
});

async function sendEmail(ctx) {
  const body = ctx.request.body;
  validate(ctx, sendEmailSchema, body);
  const {session} = ctx.models,
    token = session.constructor.genToken(),
    email = body.emailUser + '@' + body.emailServer,
    url = ctx.config.site + '/api/auth/email?email-token=' + token + '&action=' + body.action;
  await session.save(token, {
    username: body.emailUser,
    email
  }, emailTokenExpire);
  console.log(await ctx.emailTransport.sendMail({
    from: `"紫荆之声" <${ctx.config['email-transport'].auth.user}>`,
    to: email,
    subject: '请确认您的账号',
    text: `点击或在浏览器中打开以下链接以激活您的账号：\n${url}`,
    html: `<p>点击<a href="${url}">此处</a>或在浏览器中打开以下链接以激活您的账号：</p>
           <p><a href="${url}">${url}</a></p>`
  }));
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

const validateEmailSchema = ajv.compile({
  type: 'object',
  required: ['email-token', 'action'],
  properties: {
    'email-token': {type: 'string'},
    action: {type: 'string', enum: emailActions}
  },
  additionalProperties: false
});

async function validateEmail(ctx) {
  const query = ctx.query;
  validate(ctx, validateEmailSchema, query);
  const {users, session} = ctx.models,
    sess = await session.loadAndRemove(query['email-token']);
  console.log(sess);
  ctx.assert(sess && sess.username, 401, JSON.stringify({
    code: 401,
    type: 'EAUTH',
    message: 'Wrong token',
  }));
  let user = await users.findOne({username: sess.username});
  if (user === null)
    user = new users({username: sess.username});
  if (sess.email)
    user.email = sess.email;
  await user.save();
  const token = session.constructor.genToken(),
    to = new url.URL(emailActionMap[query.action], ctx.config.site);
  await session.save(token, {uid: user._id}, sessionTokenExpire);
  to.searchParams.set('token', token);
  ctx.redirect(String(to));
}

module.exports = function () {
  const router = new Router();
  router.post('/', authenticate);
  router.get('/wechat', wechatOAuth);
  router.post('/email', sendEmail);
  router.get('/email', validateEmail);
  return router;
};
