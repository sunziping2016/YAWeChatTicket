const winston = require('winston');const koaLogger = require('./lib/koa-logger');
['main'].forEach(label => {
  winston.loggers.add(label, {
    console: {
      level: 'info',
      colorize: true,
      label: label
    }
  })
});

const process = require('process');
const EventEmitter = require('events');
const logger = winston.loggers.get('main');
const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const wechat = require('co-wechat');
const wechat_handler = require('./lib/wechat-handlers');
const history = require('./lib/history-api-fallback');

/** Class representing the whole app. */
class Server {
  /**
   * Create the server.
   * @param {object} config - See config file.
   */
  constructor(config) {
    this.config = config
  }

  /**
   * Start the server.
   * @returns {Promise.<void>} Fulfilled when ready.
   */
  async start() {
    const config = this.config;
    this.app = new Koa();
    this.app.context.bus = new EventEmitter();

    this.app.use(koaLogger(logger));
    this.app.use(history());
    this.app.use(serve('public'));
    let router = new Router();
    router.all('/wechat', wechat(config.wechat).middleware(wechat_handler));
    this.app.use(router.routes());

    this.server = this.app.listen(config.port, config.host);
    logger.info('Server starts');
  }

  /**
   * Stop the server cleanly.
   * @returns {Promise.<void>} Fulfilled when exited.
   */
  async stop() {
    if (this.server) {
      await new Promise((resolve, reject) => this.server.close(resolve));
      delete this.server;
    }
    logger.info('Server stops');
  }
}

module.exports = Server;

if (!module.parent) {
  let server = new Server(require('./config.json'));
  server.start().catch(err => logger.error(err));

  process.on('uncaughtException', err => logger.error(err));
  process.on('unhandledRejection', err => logger.error(err));
  process.on('warning', warning => logger.warn(warning));

  let comfirmed = false;
  process.on('SIGINT', () => {
    if (comfirmed) {
      logger.warn('Received SIGINT again. Force stop!');
      process.exit(1);
    } else {
      logger.info('Received SIGINT. Press CTRL-C again in 5s to force stop.');
      comfirmed = true;
      let timeout = setTimeout(() => comfirmed = false, 5000);
      server.stop()
        .then(() => clearTimeout(timeout))
        .catch(err => logger.error(err));
    }
  });
}
