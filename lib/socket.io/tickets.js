const {httpAssert} = require('../apis/utils');
const createTickets = require('../base-apis/tickets').create;

module.exports = function (app, socket) {
  socket.on('ticket:create', function (data, cb) {
    (async function () {
      const {tickets, activities} = app.context.models,
        io = app.context.io, token = socket.token;
      httpAssert(token && token.uid && token.role && token.role & 0b1, 401, {
        type: 'EAUTH',
        message: 'Authentication failed'
      });
      cb(await createTickets(data, {
        tickets, activities, io, token
      }));
    })().catch(function (err) {
      if (err.expose === true)
        cb(err.data || {
          code: err.status,
          type: 'EUNKNOWN',
          message: err.message
        });
      else cb({
        code: 500,
        type: 'EINTERNAL',
        message: 'Internal server error'
      });
    });
  });
};
