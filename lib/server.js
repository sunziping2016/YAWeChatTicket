const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const wechat = require('co-wechat');
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
   * @param {object} logger - Logger. Defaults to `console`
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Start the server.
   * @returns {Promise.<void>} Fulfilled when ready.
   */
  async start() {
    const config = this.config;
    this.logger.info('Server starts');
    await mongoose.connect(config.db, {useMongoClient: true});
    this.app = new Koa();
    this.app.context.logger = this.logger;
    this.app.context.models = await models(this.app, config);
    this.app.use(koaLogger(this.logger));
    const router = new Router(),
      wechatMiddleware = wechat(config.wechat).middleware(
        await wechatHandler(this.app, config));
    router.get('/wechat', wechatMiddleware)
      .post('/wechat', wechatMiddleware);
    router.get('/uploads', serve('uploads'));
    this.app.use(router.routes());
    this.app.use(history());
    this.app.use(serve('public'));

    this.server = this.app.listen(config.port, config.host);
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
    this.logger.info('Server stops');
  }
}

module.exports = Server;
