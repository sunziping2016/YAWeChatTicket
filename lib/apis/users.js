const Router = require('koa-router');
const multer = require('koa-multer');
const ajv = new (require('ajv'))();
const {validate, copyBody, multerOptions, wrapMulterError, cleanFileOnError,
  makeThumbnail, getAuthorization} = require('./utils');

const createUserSchema = ajv.compile({
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: {type: 'string'},
    password: {type: 'string'}
  },
  additionalProperties: false
});

async function create(ctx) {
  const body = ctx.request.body,
    users = ctx.models.users;
  validate(createUserSchema, body);
  const data = await fetchIdTsinghua(body),
    info = users.mapIdTsinghua(data);
  ctx.assert(info !== null, 401, JSON.stringify({
    code: 401,
    type: 'EAUTH',
    message: 'Authentication failed',
  }));
  const result = await users.findOne({$or: [
    {username: info.username},
    {studentId: info.studentId}
  ]});
  ctx.assert(result === null, 400, JSON.stringify({
    code: 400,
    type: 'EEXISTS',
    message: 'User already exists',
    data: info
  }));
  const document = new users(info);
  await document.setPassword(body.password);
  document.createdAt = new Date();
  await document.save();
  ctx.body = {
    code: 200,
    type: 'OK',
    data: document.toPlainObject()
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
}), maxAvatarSize = 1024 * 1024;

async function patch(ctx) {
  const body = ctx.request.body,
    avatar = ctx.req.file,
    users = ctx.models.users;
  validate(patchUserSchema, body);
  const token = await getAuthorization(ctx);
  // noinspection JSBitwiseOperatorUsage
  ctx.assert(token && token.uat && (token.uid === body._id || (token.role &
      users.toRolesMask(['Administrator']))), 401, JSON.stringify({
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
  //router.post('/', create);
  router.patch('/',  wrapMulterError, avatarMulter, cleanFileOnError,
    copyBody(), patch);
  return router;
};
