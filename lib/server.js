const logger = require('winston');
const Koa = require('koa');
const http = require('http');
const Router = require('koa-router');
const serve = require('koa-static');
const mount = require('koa-mount');
const mongoose = require('mongoose');
const redis = require('redis');
const qs = require('koa-qs');
const nodemailer = require('nodemailer');
const sio = require('socket.io');
const sioRedis = require('socket.io-redis');
const wechatHandler = require('./wechat-handlers');
const history = require('./history-api-fallback');
const koaLogger = require('./koa-logger');
const models = require('./models');
const Api = require('./apis');
const SocketIO = require('./socket.io');

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
    const config = this.config;
    const app = this.app = new Koa(),
      db = this.db = await mongoose.createConnection(
        config.db, {useMongoClient: true}),
      redisClient = this.redis = redis.createClient({url: config.redis}),
      sioSubClient = this.sioRedis = redis.createClient({url: config.redis}),
      server = this.server = http.createServer(app.callback()),
      io = this.io = sio(server);
    io.adapter(sioRedis({pubClient: redisClient, subClient: sioSubClient}));
    /******** Setup Context ********/
    app.context.config = config;
    app.context.db = db;
    app.context.redis = redisClient;
    app.context.emailTransport = nodemailer.createTransport(
      config['email-transport']);
    app.context.models = await models(db, redisClient, io, config);
    app.context.io = io;
    /******** Setup Router ********/
    qs(app);
    SocketIO(app, io);
    app.use(koaLogger(logger));
    const router = new Router(),
      wechatMiddleware = await wechatHandler(app, config),
      api = Api();
    router.use('/api', api.routes(), api.allowedMethods())
      .get('/wechat', wechatMiddleware)
      .post('/wechat', wechatMiddleware);
    app.use(router.routes());
    app.use(router.allowedMethods());
    if (config.static) {
      app.use(mount('/uploads', serve('uploads')));
      app.use(history());
      app.use(serve('public'));
    }
    await new Promise(function (resolve, reject) {
      server.listen(config.port, config.host, resolve)
        .once('error', reject);
    });
  }

  /**
   * Stop the server cleanly.
   * @returns {Promise.<void>} Fulfilled when exited.
   */
  async stop() {
    if (this.io) {
      await new Promise((resolve, reject) => this.io.close(resolve));
      delete this.io;
    }
    if (this.server) {
      // Ignore error
      await new Promise((resolve, reject) => this.server.close(resolve));
      delete this.server;
    }
    if (this.sioRedis) {
      this.sioRedis.quit();
      delete this.sioRedis;
    }
    if (this.redis) {
      this.redis.quit();
      delete this.redis;
    }
    if (this.db) {
      await this.db.close();
      delete this.db
    }
    delete this.app;
  }
}

module.exports = Server;
