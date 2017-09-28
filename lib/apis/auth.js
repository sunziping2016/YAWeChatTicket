const Router = require('koa-router');
const ajv = new (require('ajv'))({ $data: true });
require('ajv-keywords')(ajv, 'select');
const jwt = require('jsonwebtoken');
const {validate} = require('./utils');

const authSchema = ajv.compile({
  type: 'object',
  required: ['strategy'],
  properties: {
    strategy: {type: 'string', enum: ['local', 'jwt']}
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
              password: {type: 'string'}
            },
            additionalProperties: false
          },
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
              password: {type: 'string'}
            },
            additionalProperties: false
          },
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
    }
  },
  selectDefault: false
});

async function authenticate(ctx) {
  const body = ctx.request.body,
    global = ctx.models.global,
    users = ctx.models.users;
  validate(ctx, authSchema, body);
  let token, decoded, user, secretKey;
  switch (body.strategy) {
    case 'local':
      const password = body.payload.password;
      delete body.payload.password;
      user = await users.findOne(body.payload);
      ctx.assert(user !== null, 401, JSON.stringify({
        code: 401,
        type: 'EAUTH',
        message: 'User does not exists',
      }));
      ctx.assert(await user.checkPassword(password), 401, JSON.stringify({
        code: 401,
        type: 'EAUTH',
        message: 'Wrong password',
      }));
      secretKey = await global.getSecretKey();
      break;
    case 'jwt':
      secretKey = await global.getSecretKey();
      try {
        decoded = await new Promise(function (resolve, reject) {
          jwt.verify(body.payload, secretKey,
            function (err, decoded) {
              if (err)
                reject(err);
              else
                resolve(decoded);
            });
        });
      } catch (err) {
        ctx.throw(401, JSON.stringify({
          code: 401,
          type: 'EAUTH',
          message: 'Failed to verify token'
        }));
      }
      user = await users.findOne({_id: decoded.id});
      break;
  }
  token = await new Promise(function (resolve, reject) {
    jwt.sign({id: user._id, role: user.role}, secretKey , {expiresIn: '7d'},
      function(err, token) {
        if (err)
          reject(err);
        else
          resolve(token);
      });
  });
  ctx.body = {
    code: 200,
    type: 'OK',
    data: {
      token,
      user: user.toPlainObject()
    }
  };
}

module.exports = function () {
  const router = new Router();
  router.post('/', authenticate);
  return router;
};
