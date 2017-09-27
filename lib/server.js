const logger = require('winston');
const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const mongoose = require('mongoose');
const wechatHandler = require('./wechat-handlers');
const history = require('./history-api-fallback');
const koaLogger = require('./koa-logger');
const models = require('./models');

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
    const app = this.app = new Koa();
    app.context.models = await models(config);
    app.use(koaLogger(logger));
    const router = new Router();
    const wechatMiddleware = await wechatHandler(app, config);
    router.get('/wechat', wechatMiddleware)
      .post('/wechat', wechatMiddleware);
    router.get('/uploads', serve('uploads'));
    app.use(router.routes());
    app.use(history());
    app.use(serve('public'));

    this.server = app.listen(config.port, config.host);
  }

  /**
   * Stop the server cleanly.
   * @returns {Promise.<void>} Fulfilled when exited.
   */
  async stop() {
    await mongoose.disconnect();
    if (this.server) {
      await new Promise((resolve, reject) => this.server.close(resolve));
      delete this.server;
    }
    logger.info('Server stops');
  }
}

module.exports = Server;
