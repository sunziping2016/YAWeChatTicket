const winston = require('winston');
const koaLogger = require('./lib/koa-logger');

const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const process = require('process');
const EventEmitter = require('events');
const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const wechat = require('co-wechat');
const mongoose = require('mongoose');
const wechatHandler = require('./lib/wechat-handlers');
const history = require('./lib/history-api-fallback');
const models = require('./lib/models');

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
    await mongoose.connect(config.db, {useMongoClient: true});
    this.app = new Koa();
    this.app.context.logger = this.logger;
    this.app.context.models = await models(config);
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
    this.logger.info('Server starts');
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

if (!module.parent) {
  winston.loggers.add('main', {
    console: {
      level: 'info',
      colorize: true,
      label: `${cluster.isMaster ? 'Master' : 'Worker'} ${process.pid}`
    }
  });
  const logger = winston.loggers.get('main');

  if (cluster.isMaster) {
    logger.info('Process starts');

    const workers = new Set();
    for (let i = 0; i < numCPUs; i++)
      workers.add(cluster.fork());

    let confirmTimeout = null;
    cluster.on('exit', (worker, code, signal) => {
      workers.delete(worker);
      if (workers.size === 0 && confirmTimeout !== null) {
        clearTimeout(confirmTimeout);
        confirmTimeout = null;
      }
      if (worker.size === 0)
        logger.info('Process stops');
    });
    process.on('SIGINT', () => {
      if (confirmTimeout !== null) {
        logger.warn('Received SIGINT again. Force stop!');
        process.exit(1);
      } else {
        logger.info('Received SIGINT. Press CTRL-C again in 5s to force stop.');
        confirmTimeout = setTimeout(() => {
          confirmTimeout = null;
        }, 5000);
      }
    });
  } else {
    const server = new Server(require('./config.json'), logger);
    server.start().catch(err => logger.error(err));

    process.on('uncaughtException', err => logger.error(err));
    process.on('unhandledRejection', err => logger.error(err));
    process.on('warning', warning => logger.warn(warning));
    process.on('SIGINT', () => {
      server.stop()
        .then(() => process.exit())
        .catch(err => logger.error(err));
    });
  }
}
