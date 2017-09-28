const Router = require('koa-router');
const request = require('request-promise-native').defaults({
  followAllRedirects: true,
  gzip: true
});
const ajv = new (require('ajv'))();
const {validate} = require('./utils');

const createUserSchema = ajv.compile({
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: {type: 'string'},
    password: {type: 'string'}
  },
  additionalProperties: false
});

async function fetchIdTsinghua(data) {
  const response = await request({
    jar: request.jar(),
    uri: 'https://id.tsinghua.edu.cn/security_check',
    method: 'POST',
    form: data,
  });
  const regex = /\$\.extend\(uidm, (.+?)\);/g, output = {};
  let match = null;
  while (match = regex.exec(response))
    Object.assign(output, JSON.parse(match[1]));
  return output;
}

async function create(ctx) {
  const body = ctx.request.body,
    users = ctx.models.users;
  validate(ctx, createUserSchema, body);
  const data = await fetchIdTsinghua(body),
    info = users.mapIdTsinghua(data);
  ctx.assert(info !== null, 400, JSON.stringify({
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
  document.createAt = new Date();
  await document.save();
  ctx.body = {
    code: 200,
    type: 'OK',
    data: document.toPlainObject()
  };
}

module.exports = function () {
  const router = new Router();
  router.post('/', create);
  return router;
};
