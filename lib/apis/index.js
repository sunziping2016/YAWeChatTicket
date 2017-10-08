const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const UsersRouter = require('./users');
const AuthRouter = require('./auth');

async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    if (err.expose === true) {
      ctx.status = err.status || 500;
      ctx.type = 'json';
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

module.exports = function () {
  const router = new Router(),
    userRouter = UsersRouter(),
    authRouter = AuthRouter();
  router.use(errorHandler);
  router.use(bodyParser({
    onerror: function (err, ctx) {
      ctx.throw(422, JSON.stringify({
        code: 422,
        type: 'EPARSE',
        message: 'Failed to parse body'
      }));
    }
  }));
  router.get('/site', getSite);
  router.use('/auth', authRouter.routes(), authRouter.allowedMethods());
  router.use('/user', userRouter.routes(), userRouter.allowedMethods());
  return router;
};
