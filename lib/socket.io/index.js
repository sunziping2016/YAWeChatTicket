const logger = require('winston');
const jwt = require('jsonwebtoken');

module.exports = function (app, io) {
  io.on('connect', function (socket) {
    logger.info(`SocketIO: client ${socket.id} connected`);

    socket.on('auth', function (token) {
      (async function () {
        await Promise.all(Object.keys(socket.rooms).filter(function (room) {
          return room !== socket.id;
        }).map(function (room) {
          return new Promise(function (resolve, reject) {
            socket.leave(room, function (err) {
              if (err)
                reject(err);
              else
                resolve();
            });
          });
        }));
        if (token) {
          const secretKey = await app.context.models.global.getSecretKey();
          token = await new Promise(function (resolve, reject) {
            jwt.verify(token, secretKey, function (err, decoded) {
              if (err)
                resolve(null);
              else
                resolve(decoded);
            });
          });
          if (token) {
            let rooms = [];
            if (token.uid)
              rooms.push(`user:${token.uid}`);
            if (token.wid)
              rooms.push(`wechat-user:${token.wid}`);
            if (token.role)
              rooms = rooms.concat(app.context.models.users.maskToRoles(token.role)
                .map(function (x) {
                  return x.toLowerCase() + 's';
                }));
            await new Promise(function (resolve, reject) {
              socket.join(rooms, function (err) {
                if (err)
                  reject(err);
                else
                  resolve();
              });
            });
          }
        }
      })().catch(function (err) {
        logger.error(`Failed to auth client ${socket.id}`);
        logger.error(err);
      });
    });

    socket.on('disconnect', function () {
      logger.info(`SocketIO: client ${socket.id} disconnected`);
    })
  });
};
