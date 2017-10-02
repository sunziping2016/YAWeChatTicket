const logger = require('winston');
const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const mongoose = require('mongoose');
const redis = require('redis');
const qs = require('koa-qs');
const wechatHandler = require('./wechat-handlers');
const history = require('./history-api-fallback');
const koaLogger = require('./koa-logger');
const models = require('./models');
const Api = require('./apis');

mongoose.Promise = global.Promise;

/** Class representing the whole app. */
class Server {
  /**
   * Create the server.
   * @param {object} config - See config file.
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Start the server.
   * @returns {Promise.<void>} Fulfilled when ready.
   */
  async start() {
    logger.info('Server starts');
    const config = this.config;
    await mongoose.connect(config.db, {useMongoClient: true});
    const redisClient = redis.createClient({url: config.redis});
    const app = this.app = new Koa();
    qs(app);
    app.context.redis = redisClient;
    app.context.models = await models(redisClient, config);
    app.use(koaLogger(logger));
    const router = new Router(),
      wechatMiddleware = await wechatHandler(app, config),
      api = Api();
    router.get('/wechat', wechatMiddleware)
      .post('/wechat', wechatMiddleware);
    router.use('/api', api.routes(), api.allowedMethods());
    router.get('/uploads', serve('uploads'));
    app.use(router.routes());
    app.use(history());
    app.use(serve('public'));

    app.context.server = app.listen(config.port, config.host);
  }

  /**
   * Stop the server cleanly.
   * @returns {Promise.<void>} Fulfilled when exited.
   */
  async stop() {
    const app = this.app;
    if (app) {
      await mongoose.disconnect();
      app.context.redis.quit();
      await new Promise((resolve, reject) => app.context.server.close(resolve));
      delete this.app;
    }
    logger.info('Server stops');
  }
}

module.exports = Server;
