const logger = require('winston');
const cluster = require('cluster');
const process = require('process');
const config = require('./config.json');

logger.configure({
  transports: [
    new (logger.transports.Console)({
      level: config.loglevel || 'info',
      colorize: true,
      label: (config.cluster ? (cluster.isMaster ? 'Master' : 'Worker') :
        'Main') + ' ' + process.pid
    })
  ]
});

process.on('uncaughtException', function (err) {
  logger.error('uncaughtException');
  logger.error(err);
});
process.on('unhandledRejection', function (err) {
  logger.error('unhandledRejection');
  logger.error(err);
});
process.on('warning', function (warn) {
  logger.warn(warn);
});

if (config.cluster) {
  if (config.cluster === true)
    config.cluster = require('os').cpus().length;
  if (cluster.isMaster) {
    logger.info('Master starts');

    const workers = new Set();
    for (let i = 0; i < config.cluster; i++)
      workers.add(cluster.fork({
        WORKER_NUM: config.cluster,
        WORKER_INDEX: i
      }));

    let confirmTimeout = null;
    cluster.on('exit', function (worker) {
      workers.delete(worker);
      if (workers.size === 0 && confirmTimeout !== null) {
        clearTimeout(confirmTimeout);
      }
      if (workers.size === 0)
        logger.info('Master stops');
    });
    process.on('SIGINT', function () {
      if (confirmTimeout !== null) {
        logger.warn('Received SIGINT again. Force stop!');
        process.exit(1);
      } else {
        logger.info('Received SIGINT. Press CTRL-C again in 5s to force stop.');
        confirmTimeout = setTimeout(function () {
          confirmTimeout = null;
        }, 5000);
      }
    });
  } else {
    const server = new (require('./lib/server'))(config);
    server.start().catch(function (err) {
      logger.error('Error when starting server');
      logger.error(err)
    });

    process.on('SIGINT', function () {
      server.stop()
        .then(function () {
          process.exit();
        })
        .catch(function (err) {
          logger.error('Error when stopping server');
          logger.error(err)
        });
    });
  }
} else {
  process.env.WORKER_NUM = '1';
  process.env.WORKER_INDEX = '0';
  const server = new (require('./lib/server'))(config);
  server.start().catch(function (err) {
    logger.error('Error when starting server');
    logger.error(err)
  });

  let confirmTimeout = null;
  process.on('SIGINT', function () {
    if (confirmTimeout !== null) {
      logger.warn('Received SIGINT again. Force stop!');
      process.exit(1);
    } else {
      logger.info('Received SIGINT. Press CTRL-C again in 5s to force stop.');
      confirmTimeout = setTimeout(function () {
        confirmTimeout = null;
      }, 5000);
      server.stop()
        .then(function () {
          clearTimeout(confirmTimeout);
        })
        .catch(function (err) {
          logger.error('Error when stopping server');
          logger.error(err)
        });
    }
  });
}

