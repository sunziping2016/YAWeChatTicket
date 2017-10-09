const Router = require('koa-router');
const multer = require('koa-multer');
const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, copyBody, multerOptions, wrapMulterError,
  cleanFileOnError, makeThumbnail, getAuthorization} = require('./utils');

const maxAvatarSize = 1024 * 1024;

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
  const token = await getAuthorization(ctx), data = {roles: []};
  if (token && token.role && token.role & 0b100) {
    ['username', 'password', 'role'].forEach(function (key) {
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
      message: 'User must hava password'
    });
    httpAssert(body.token, 400, {
      type: 'ESCHEMA',
      message: 'Requires token'
    });
    data.password = body.password;
  }
  if (avatar) {
    httpAssert(avatar.size <= maxAvatarSize, 400, {
      type: 'ESCHEMA',
      message: 'File too large'
    });
    data.avatar = avatar.filename;
    ctx.files.push(data.avatarThumbnail = await makeThumbnail(avatar.filename));
  }
  if (body.token) {
    const sess = await session.loadAndRemove('user:' + body.token);
    httpAssert(sess && sess.username , 400, {
      type: 'ESCHEMA',
      message: 'Wrong token'
    });
    Object.keys(sess).forEach(function(key) {
      if (key === 'roles') {
        for (let role of JSON.parse(sess[key]))
          if (data[key].indexOf(role) === -1)
            data[key].push(role);
      } else if (data[key] === undefined)
        data[key] = sess[key];
    });
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
    type: 'EEXISTS',
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
  required: ['_id'],
  properties: {
    _id: {type: 'string'},
    password: {type: 'string'}
  },
  additionalProperties: false
});

async function patch(ctx) {
  const body = ctx.request.body,
    avatar = ctx.req.file,
    users = ctx.models.users;
  validate(patchUserSchema, body);
  const token = await getAuthorization(ctx);
  // noinspection JSBitwiseOperatorUsage
  ctx.assert(token && (token.uid === body._id || (token.role && token.role &
      0b100)), 401, JSON.stringify({
    code: 401,
    type: 'EAUTH',
    message: 'Authentication failed'
  }));
  const user = await users.findOne({_id: body._id});
  ctx.assert(user, 400, JSON.stringify({
    code: 400,
    type: 'EEXISTS',
    message: 'User does not exist'
  }));
  ctx.assert(user.secureUpdatedAt.getTime() === token.uat, 401, JSON.stringify({
    code: 401,
    type: 'EAUTH',
    message: 'Authentication failed'
  }));
  if (avatar) {
    ctx.assert(avatar.size <= maxAvatarSize, 400, JSON.stringify({
      code: 400,
      type: 'ESCHEMA',
      message: 'File too large'
    }));
    body.avatar = avatar.filename;
    body.avatarThumbnail = await makeThumbnail(avatar.filename);
  }
  const password = body.password;
  delete body.password;
  Object.keys(body).forEach(function (key) {
    user[key] = body[key];
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

module.exports = function () {
  const router = new Router(),
    avatarMulter = multer(multerOptions(['image/png', 'image/gif',
      'image/jpeg'], maxAvatarSize)).single('avatar');
  router.post('/', wrapMulterError, avatarMulter, cleanFileOnError,
    copyBody(), create);
  router.patch('/',  wrapMulterError, avatarMulter, cleanFileOnError,
    copyBody(), patch);
  return router;
};
