const Router = require('koa-router');
const multer = require('koa-multer');
const compose = require('koa-compose');
const path = require('path');
const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, copyBody, multerOptions, wrapMulterError,
  cleanFileOnError, makeThumbnail, getAuthorization, mergeUserToken} =
  require('./utils');

const maxAvatarSize = 5 * 1024 * 1024,
  idRegex = /^[a-f\d]{24}$/i;

const createUserSchema = ajv.compile({
  type: 'object',
  properties: {
    username: {type: 'string'},
    password: {type: 'string', minLength: 8},
    token: {type: 'string'},
    roles: {
      type: 'array',
      items: {type: 'string', enum: [
        'user', 'publisher', 'administrator'
      ]},
      uniqueItems: true,
      maxItems: 3
    }
  },
  additionalProperties: false
});

async function create(ctx) {
  const body = ctx.request.body,
    avatar = ctx.req.file,
    {users, session} = ctx.models;
  httpValidate(createUserSchema, body);
  const token = await getAuthorization(ctx), data = {};
  if (token && token.role && token.role & 0b100) {
    ['username', 'password', 'roles'].forEach(function (key) {
      if (body[key])
        data[key] = body[key];
    });
  } else {
    httpAssert(body.username === undefined && body.role === undefined, 401, {
      type: 'EAUTH',
      message: 'Authentication failed'
    });
    httpAssert(body.password, 400, {
      type: 'ESCHEMA',
      message: 'User must have password'
    });
    httpAssert(body.token, 400, {
      type: 'ESCHEMA',
      message: 'Requires token'
    });
    data.password = body.password;
  }
  if (avatar) {
    data.avatar = avatar.filename;
    ctx.files.push(path.join('uploads', data.avatarThumbnail =
      await makeThumbnail(avatar.filename)));
  }
  if (body.token) {
    const sess = await session.loadAndRemove('user:' + body.token);
    httpAssert(sess && (data.username === undefined ||
        sess.username === data.username), 400, {
      type: 'ESCHEMA',
      message: 'Wrong token'
    });
    mergeUserToken(data, sess);
  }
  httpAssert(data.username, 400, {
    type: 'ESCHEMA',
    message: 'User must hava username'
  });
  const query = [{username: data.username}];
  if (data.studentId)
    query.push({studentId: data.studentId});
  const result = await users.findOne({$or: query}).notDeleted(),
    password = data.password;
  ctx.assert(!result, 400, JSON.stringify({
    code: 400,
    type: 'ESCHEMA',
    message: 'User already exists',
  }));
  delete data.password;
  const user = new users(data);
  await user.setPassword(password);
  await user.save();
  ctx.body = {
    code: 200,
    type: 'OK',
    data: user.toPlainObject()
  };
}

const patchUserSchema = ajv.compile({
  type: 'object',
  properties: {
    password: {type: 'string', minLength: 8},
    token: {type: 'string'},
    roles: {
      type: 'array',
      items: {type: 'string', enum: [
        'user', 'publisher', 'administrator'
      ]},
      uniqueItems: true,
      maxItems: 3
    },
    blocked: {type: 'boolean'}
  },
  additionalProperties: false
});

async function patch(ctx) {
  const id = ctx.params.id,
    body = ctx.request.body,
    avatar = ctx.req.file,
    {users, session} = ctx.models;
  httpValidate(patchUserSchema, body);
  const token = await getAuthorization(ctx), data = {};
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Requires id'
  });
  httpAssert(token, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  if (token.role && token.role & 0b100) {
    ['password', 'roles', 'blocked'].forEach(function (key) {
      if (body[key])
        data[key] = body[key];
    });
  } else {
    httpAssert(token.uid === id && (body.role === undefined &&
        body.blocked === undefined), 401, {
      type: 'EAUTH',
      message: 'Authentication failed'
    });
    data.password = body.password;
  }
  if (avatar) {
    data.avatar = avatar.filename;
    ctx.files.push(path.join('uploads', data.avatarThumbnail =
      await makeThumbnail(avatar.filename)));
  }
  const user = await users.findById(id).notDeleted();
  httpAssert(user, 400, {
    type: 'ESCHEMA',
    message: 'User does not exist'
  });
  if (body.token) {
    const sess = await session.loadAndRemove('user:' + body.token);
    httpAssert(sess && (sess.username === user.username), 400, {
      type: 'ESCHEMA',
      message: 'Wrong token'
    });
    mergeUserToken(data, sess);
  }
  const password = data.password;
  delete data.password;
  Object.keys(data).forEach(function (key) {
    user[key] = data[key];
  });
  if (password)
    await user.setPassword(password);
  await user.save();
  ctx.body = {
    code: 200,
    type: 'OK',
    data: user.toPlainObject()
  };
}

async function deleteUser(ctx) {
  const id = ctx.params.id,
    {users} = ctx.models,
    token = await getAuthorization(ctx);
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Requires id'
  });
  httpAssert(token && token.role && token.role & 0b100, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  const user = await users.findById(id).notDeleted();
  httpAssert(user, 400, {
    type: 'ESCHEMA',
    message: 'User does not exist'
  });
  await user.delete();
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

module.exports = function () {
  const router = new Router(),
    multipart = compose([
      wrapMulterError,
      multer(multerOptions(['image/png', 'image/gif',
        'image/jpeg'], maxAvatarSize)).single('avatar'),
      cleanFileOnError,
      copyBody()
    ]);
  router.post('/', multipart, create);
  router.patch('/:id', multipart, patch);
  router.delete('/:id', deleteUser);
  return router;
};
