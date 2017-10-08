const logger = require('winston');
const cluster = require('cluster');
const process = require('process');
const config = require('./config.json');
const parseArgs = require('minimist');

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

const argv = parseArgs(process.argv.slice(2));
if (argv.host)
  config.host = argv.host;
if (argv.port)
  config.port = argv.port;
if (argv.cluster)
  config.cluster = argv.cluster;
if (argv.site)
  config.site = argv.site;
if (config.cluster === true)
  config.cluster = require('os').cpus().length;

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

if (config.cluster) {
  if (cluster.isMaster) {
    const workers = [];
    let server = null;
    if (config.sticky) {
      const net = require('net');
      const farmhash = require('farmhash');
      server = net.createServer({pauseOnConnect: true}, function (socket) {
        // FIXME: Not working behind reverse proxy.
        const remoteAddress = socket.remoteAddress,
          hash = farmhash.fingerprint32(remoteAddress),
          worker = workers[hash % workers.length];
        worker.send('sticky-session:connection', socket);
      });

      server.listen(config.port, config.host, function () {
        logger.info(`Master server starts at http://${config.host}:${config.port}`);
        for (let i = 0; i < config.cluster; i++)
          workers.push(cluster.fork({
            WORKER_NUM: config.cluster,
            WORKER_INDEX: i
          }));
      }).once('error', function (err) {
        logger.error('Error when starting master server');
        logger.error(err);
      });
    } else {
      logger.info(`Master starts at http://${config.host}:${config.port}`);
      for (let i = 0; i < config.cluster; i++)
        workers.push(cluster.fork({
          WORKER_NUM: config.cluster,
          WORKER_INDEX: i
        }));
    }

    let confirmTimeout = null;
    cluster.on('exit', function (worker, code) {
      const index = workers.indexOf(worker);
      if (index >= 0)
        workers.splice(index, 1);
      if (workers.length === 0) {
        if (confirmTimeout !== null) {
          clearTimeout(confirmTimeout);
        }
        if (server)
          server.close(function () {
            logger.info('Master server stops');
          });
        else
          logger.info('Master stops');
      }
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
    if (config.sticky)
      config.port = 0;
    const server = new (require('./lib/server'))(config);
    server.start()
      .then(function () {
        logger.info('Worker Server starts');
        if (config.sticky) {
          process.on('message', function (message, connection) {
            if (message !== 'sticky-session:connection')
              return;
            server.server.emit('connection', connection);
            connection.resume();
          });
        }
      })
      .catch(function (err) {
        logger.error('Error when starting worker server');
        logger.error(err);
        server.stop();
      });

    process.on('SIGINT', function () {
      server.stop()
        .then(function () {
          logger.info('Worker Server stops');
          process.exit();
        })
        .catch(function (err) {
          logger.error('Error when stopping worker server');
          logger.error(err)
        });
    });
  }
} else {
  process.env.WORKER_NUM = '1';
  process.env.WORKER_INDEX = '0';
  const server = new (require('./lib/server'))(config);
  server.start()
    .then(function () {
      logger.info(`Server starts at http://${config.host}:${config.port}`);
    })
    .catch(function (err) {
      logger.error('Error when starting server');
      logger.error(err);
      server.stop();
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
          logger.info('Server stops');
          clearTimeout(confirmTimeout);
        })
        .catch(function (err) {
          logger.error('Error when stopping server');
          logger.error(err)
        });
    }
  });
}

