const Router = require('koa-router');
const ajv = new (require('ajv'))({ $data: true });
const logger = require('winston');
require('ajv-keywords')(ajv, 'select');
const jwt = require('jsonwebtoken');
const url = require('url');
const {httpThrow, httpValidate, httpAssert, getAuthorization} =
  require('./utils');

const sessionTokenExpire = 120,     // 2min
  emailTokenExpire = 7 * 24 * 3600, // 7day
  tsinghuaTokenExpire = 24 * 3600,  // 1day
  jwtExpire = '1d';                 // 1day

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

async function auth(ctx) {
  const body = ctx.request.body,
    {global, users, wechatUsers, session} = ctx.models;
  httpValidate(authSchema, body);
  let oldToken = body.strategy === 'jwt' ? body.payload : body.payload.jwt,
    oldTokenPayload = {}, newTokenPayload = {}, error = null,
    user = null, wechatUser = null, secretKey = await global.getSecretKey();
  if (oldToken) {
    try {
      oldTokenPayload = await new Promise(function (resolve, reject) {
        jwt.verify(oldToken, secretKey, function (err, decoded) {
            if (err)
              reject(err);
            else
              resolve(decoded);
          });
      });
    } catch (err) {
      if (err.name !== 'TokenExpiredError')
        error = err.message || 'JWT error';
    }
  }
  switch (body.strategy) {
    case 'local':
      const password = body.payload.password,
        query = {};
      if (body.payload.username)
        query.username = body.payload.username;
      else
        query.studentId = body.payload.studentId;
      user = await users.findOne(query).notDeleted();
      if (!user)
        error = 'User does not exist';
      else if (users.blocked)
        error = 'User in blacklist';
      else if (user.requirePasswordReset)
        error = 'Requires password reset';
      else if (!await user.checkPassword(password))
        error = 'Wrong password';
      else {
        newTokenPayload.uid = user._id;
        newTokenPayload.role = user.rolesMask;
        newTokenPayload.uat = user.secureUpdatedAt.getTime();
      }
      break;
    case 'session':
      const sess = await session.loadAndRemove('token:' + body.payload.token);
      if (!sess)
        error = 'Wrong session token';
      else {
        if (sess.wid) {
          wechatUser = await wechatUsers.findById(sess.wid).notDeleted();
          if (!wechatUser)
            error = 'Wechat user does not exists';
          else if (wechatUser.blocked)
            error = 'Wechat user in blacklist';
          else
            newTokenPayload.wid = wechatUser._id;
        }
        if (sess.uid) {
          user = await users.findById(sess.uid).notDeleted();
          if (!user)
            error = 'User does not exists';
          else if (user.blocked)
            error = 'User in blacklist';
          else {
            newTokenPayload.uid = user._id;
            newTokenPayload.role = user.rolesMask;
            newTokenPayload.uat = user.secureUpdatedAt.getTime();
          }
        }
        if (sess.iat)
          newTokenPayload.iat = parseInt(sess.iat);
        if (sess.exp)
          newTokenPayload.exp = parseInt(sess.exp);
      }
      break;
  }
  // Try use old token for user
  if (!newTokenPayload.uid && oldTokenPayload.uid && oldTokenPayload.uat) {
    user = await users.findById(oldTokenPayload.uid).notDeleted();
    if (!user)
      error = error || 'User does not exists';
    else if (user.blocked)
      error = error || 'User in blacklist';
    else if (user.secureUpdatedAt.getTime() !== oldTokenPayload.uat)
      error = error || 'Credentials have been updated';
    else {
      newTokenPayload.uid = user._id;
      newTokenPayload.role = user.rolesMask;
      newTokenPayload.uat = user.secureUpdatedAt.getTime();
    }
  }
  // Try use old token for wechat user
  if (!newTokenPayload.wid && oldTokenPayload.wid) {
    wechatUser = await wechatUsers.findById(oldTokenPayload.wid).notDeleted();
    if (!wechatUser)
      error = error || 'Wechat user does not exists';
    else if (wechatUser.blocked)
      error = error || 'Wechat user in blacklist';
    else
      newTokenPayload.wid = wechatUser._id;
  }
  // Try use bound information for user
  if (!newTokenPayload.uid && newTokenPayload.wid && wechatUser.userId) {
    user = await users.findById(sess.uid).notDeleted();
    if (!user) {
      delete wechatUser.userId;
      await wechatUser.save();
      error = error || 'Bound user does not exists';
    } else if (user.blocked)
      error = error || 'Bound user in blacklist';
    else {
      newTokenPayload.uid = user._id;
      newTokenPayload.role = user.rolesMask;
      newTokenPayload.uat = user.secureUpdatedAt.getTime();
    }
  }
  // Try use bound information for wechat user
  if (!newTokenPayload.wid && newTokenPayload.uid && user.wechatId) {
    wechatUser = await wechatUsers.findById(user.wechatId).notDeleted();
    if (!wechatUser) {
      delete user.wechatId;
      await user.save();
      error = error || 'Bound wechat user does not exists';
    } else if (wechatUser.blocked)
      error = error || 'Bound wechat user in blacklist';
    else
      newTokenPayload.wid = wechatUser._id;
  }
  const data = {};
  if (newTokenPayload.wid || newTokenPayload.uid)
    data.token = await new Promise(function (resolve, reject) {
      const options = {};
      if (!newTokenPayload.exp)
        options.expiresIn = jwtExpire;
      jwt.sign(newTokenPayload, secretKey, options,
        function(err, token) {
          if (err)
            reject(err);
          else
            resolve(token);
        });
    });
  if (newTokenPayload.uid)
    data.user = user.toPlainObject();
  if (newTokenPayload.wid)
    data.wechatUser = wechatUser.toPlainObject();
  httpAssert(!error, 401, {
    type: 'EAUTH',
    message: error,
    data
  });
  ctx.body = {
    code: 200,
    type: 'OK',
    data
  };
}

const validateWechatSchema = ajv.compile({
  type: 'object',
  required: ['code', 'to'],
  properties: {
    code: {type: 'string'},
    state: {type: 'string'},
    to: {type: 'string'}
  },
  additionalProperties: false
});

async function validateWechat(ctx) {
  const query = ctx.query;
  httpValidate(validateWechatSchema, query);
  const to = new url.URL(query.to, ctx.config.site),
    wechat = ctx.models.global.getWechat(),
    wechatOAuth = ctx.models.wechatOAuth.getOAuth(),
    {wechatUsers, session} = ctx.models;
  httpAssert(to.origin === ctx.config.site, 400, {
    type: 'ESCHEMA',
    message: 'Cross site redirection'
  });
  const openId = (await wechatOAuth.getAccessToken(query.code)).data.openid,
    token = session.genToken(), data = {wid: openId},
    oldToken = to.searchParams.get('token');
  (async () => {
    let document = await wechatUsers.findById(openId);
    if (document === null) {
      document = new wechatUsers({_id: openId});
      Object.assign(document, await wechatUsers.mapWechat(await wechat.getUser(openId)));
      await document.save();
      logger.info(`Update wechat user's record: ${openId}`)
    }
  })().catch(function (err) {
    logger.error(`Failed to update user's info`);
    logger.error(err);
  });
  if (oldToken) {
    const sess = await session.loadAndRemove('token:' + oldToken);
    if (sess && sess.uid)
      data.uid = sess.uid;
    if (sess && sess.iat)
      data.iat = sess.iat;
    if (sess && sess.exp)
      data.exp = sess.exp;
  }
  await session.save('token:' + token, data, sessionTokenExpire);
  to.searchParams.set('token', token);
  ctx.redirect(String(to));
}

const sendEmailSchema = ajv.compile({
  type: 'object',
  required: ['emailUser', 'emailServer', 'to'],
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
    to: {type: 'string'}
  },
  additionalProperties: false
});

async function sendEmail(ctx) {
  const body = ctx.request.body;
  httpValidate(sendEmailSchema, body);
  const {session} = ctx.models,
    token = session.genToken(),
    email = body.emailUser + '@' + body.emailServer,
    url = ctx.config.site + '/api/auth/email?email-token=' + token + '&action=' + body.action;
  await session.save(token, {
    username: body.emailUser,
    email
  }, emailTokenExpire);
  await ctx.emailTransport.sendMail({
    from: `"紫荆之声" <${ctx.config['email-transport'].auth.user}>`,
    to: email,
    subject: '请确认您的账号',
    text: `点击或在浏览器中打开以下链接以激活您的账号：\n${url}`,
    html: `<p>点击<a href="${url}">此处</a>或在浏览器中打开以下链接以激活您的账号：</p>
           <p><a href="${url}">${url}</a></p>`
  });
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

const validateEmailSchema = ajv.compile({
  type: 'object',
  required: ['email-token', 'to'],
  properties: {
    'email-token': {type: 'string'},
    to: {type: 'string'}
  },
  additionalProperties: false
});

async function validateEmail(ctx) {
  const query = ctx.query;
  httpValidate(validateEmailSchema, query);
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
  const token = session.genToken(),
    to = new url.URL(emailActionMap[query.action], ctx.config.site);
  await session.save(token, {uid: user._id}, sessionTokenExpire);
  to.searchParams.set('token', token);
  ctx.redirect(String(to));
}

async function validateTsinghua(ctx) {

}

const bindWechatSchema = ajv.compile({
  type: 'object',
  required: ['user', 'wechatUser'],
  properties: {
    user: {type: 'string'},
    wechatUser: {type: 'string'}
  },
  additionalProperties: false
});

async function bindWechat(ctx) {
  const body = ctx.request.body,
    {users, wechatUsers} = ctx.models;
  httpValidate(bindWechatSchema, body);
  const token = await getAuthorization(ctx);
  httpAssert(token && (token.role & 0b100 || (body.user === token.uid &&
    body.wechatUser === token.wid)), 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  const [user, wechatUser] = await Promise.all([
    users.findById(body.user).notDeleted(),
    wechatUsers.findById(body.wechatUser).notDeleted()
  ]);
  httpAssert(user && wechatUser, 400, {
    type: 'EEXISTS',
    message: 'User does not exist'
  });
  httpAssert(!user.wechatId && !wechatUser.userId, 400, {
    type: 'EEXISTS',
    message: 'Already bound'
  });
  user.wechatId = body.wechatUser;
  wechatUser.userId = body.user;
  await Promise.all([
    user.save(),
    wechatUser.save()
  ]);
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

const unbindWechatSchema = ajv.compile({
  type: 'object',
  required: ['user'],
  properties: {
    user: {type: 'string'}
  },
  additionalProperties: false
});

async function unbindWechat(ctx) {
  const body = ctx.request.body,
    {users, wechatUsers} = ctx.models;
  httpValidate(unbindWechatSchema, body);
  const token = await getAuthorization(ctx);
  httpAssert(token && (token.role & 0b100 || body.user === token.uid), 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  const user = await users.findById(body.user).notDeleted();
  httpAssert(user, 400, {
    type: 'EEXISTS',
    message: 'User does not exist'
  });
  httpAssert(user.wechatId, 400, {
    type: 'EEXISTS',
    message: 'Already unbound'
  });
  const wechatUser = await wechatUsers.findById(user.wechatId).notDeleted();
  httpAssert(wechatUser, 400, {
    type: 'EEXISTS',
    message: 'User does not exist'
  });
  user.wechatId = undefined;
  wechatUser.userId = undefined;
  await Promise.all([
    user.save(),
    wechatUser.save()
  ]);
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

async function createSession(ctx) {
  const token = await getAuthorization(ctx);
  httpAssert(token && (token.uid || token.wid), 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  const {session} = ctx.models, newToken = session.genToken(), data = {};
  if (token.uid)
    data.uid = token.uid;
  if (token.wid)
    data.wid = token.wid;
  if (token.iat)
    data.iat = token.iat;
  if (token.exp)
    data.exp = token.exp;
  await session.save('token:' + newToken, data, sessionTokenExpire);
  ctx.body = {
    code: 200,
    type: 'OK',
    data: newToken
  };
}

module.exports = function () {
  const router = new Router();
  router.post('/', auth);
  router.get('/wechat', validateWechat);
  router.post('/email', sendEmail);
  router.get('/email', validateEmail);
  router.post('/tsinghua', validateTsinghua);
  router.post('/bind', bindWechat);
  router.post('/unbind', unbindWechat);
  router.post('/session', createSession);
  return router;
};
