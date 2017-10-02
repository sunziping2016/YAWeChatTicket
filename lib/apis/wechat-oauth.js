const Router = require('koa-router');
const url = require('url');
const ajv = new (require('ajv'))();
const {validate} = require('./utils');

const expire = 120;

const oauthSchema = ajv.compile({
  type: 'object',
  required: ['code', 'state', 'to'],
  properties: {
    code: {type: 'string'},
    state: {type: 'string'},
    to: {type: 'string'}
  },
  additionalProperties: false
});

async function oauth(ctx) {
  console.log(ctx.headers['x-real-ip']);
  const query = ctx.query;
  validate(ctx, oauthSchema, query);
  const to = new url.URL(query.to, ctx.config.site),
    wechat = ctx.models.wechatOAuth.getOAuth(),
    session = ctx.models.session;
  ctx.assert(to.origin === ctx.config.site, 400, JSON.stringify({
    code: 400,
    type: 'ESCHEMA',
    message: 'Cross origin',
  }));
  const openid = (await wechat.getAccessToken(query.code)).data.openid,
    token = session.constructor.genToken();
  session.save(token, {wid: openid}, expire);
  to.searchParams.set('token', token);
  ctx.redirect(String(to));
}

module.exports = function () {
  const router = new Router();
  router.get('/', oauth);
  return router;
};
