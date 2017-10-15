const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const ajv = new (require('ajv'))();
const url = require('url');
const UsersRouter = require('./users');
const AuthRouter = require('./auth');
const ActivitiesRouter = require('./activities');
const TicketsRouter = require('./tickets');
const {createTicketSession, checkTicketSession} = require('./ticket-session');
const {getWechatMenuAndRecentActivities, setWechatMenu} = require('./wechat-menu');
const {httpValidate, httpAssert, httpThrow} = require('./utils');

async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    if (err.expose === true) {
      ctx.status = err.status || 500;
      ctx.type = 'json';
      if (err.data)
        ctx.body = JSON.stringify(err.data);
      else
        ctx.body = err.message;
    } else {
      ctx.status = 500;
      ctx.type = 'json';
      ctx.body = JSON.stringify({
        code: 500,
        type: 'EINTERNAL',
        message: 'Internal server error'
      });
      ctx.app.emit('error', err, ctx);
    }
  }
}

async function getSite(ctx) {
  ctx.body = {
    code: 200,
    type: 'OK',
    data: {
      wechatAppid: ctx.config.wechat.appid
    }
  };
}

const signWechatSchema = ajv.compile({
  type: 'object',
  required: ['url', 'jsApiList'],
  properties: {
    url: {type: 'string'},
    debug: {type: 'boolean'},
    jsApiList: {
      type: 'array',
      items: {type: 'string'}
    }
  },
  additionalProperties: false
});

async function signWechat(ctx) {
  const body = ctx.request.body,
    wechat = ctx.models.global.getWechat();
  httpValidate(signWechatSchema, body);
  const site = new url.URL(body.url, ctx.config.site);
  httpAssert(site.origin === ctx.config.site, 400, {
    type: 'ESCHEMA',
    message: 'Cross site'
  });
  site.hash = '';
  const result = await wechat.getJsConfig({
    debug: body.debug || false,
    url: String(site),
    jsApiList: body.jsApiList
  });
  ctx.body = {
    code: 200,
    type: 'OK',
    data: result
  };
}

module.exports = function () {
  const router = new Router(),
    userRouter = UsersRouter(),
    authRouter = AuthRouter(),
    activityRouter = ActivitiesRouter(),
    ticketRouter = TicketsRouter();
  router.use(errorHandler);
  router.use(bodyParser({
    onerror: function (err, ctx) {
      httpThrow(422, {
        type: 'EPARSE',
        message: 'Failed to parse body'
      });
    }
  }));
  router.get('/site', getSite);
  router.post('/sign-wechat', signWechat);
  router.use('/auth', authRouter.routes(), authRouter.allowedMethods());
  router.use('/user', userRouter.routes(), userRouter.allowedMethods());
  router.use('/activity', activityRouter.routes(), activityRouter.allowedMethods());
  router.use('/ticket', ticketRouter.routes(), ticketRouter.allowedMethods());
  router.get('/check-ticket', createTicketSession);
  router.post('/check-ticket', checkTicketSession);
  router.get('/wechat-menu', getWechatMenuAndRecentActivities);
  router.post('/wechat-menu', setWechatMenu);
  return router;
};
