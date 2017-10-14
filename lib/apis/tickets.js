const Router = require('koa-router');
const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, httpThrow, getAuthorization} =
  require('./utils');

const idRegex = /^[a-f\d]{24}$/i;
const createTickets = require('../base-apis/tickets').create;

async function create(ctx) {
  const data = ctx.request.body,
    {tickets, activities} = ctx.models,
    io = ctx.io;
  const token = await getAuthorization(ctx);
  httpAssert(token && token.uid && token.role && token.role & 0b1, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  ctx.body = await createTickets(data, {
    tickets, activities, io, token
  });
}

module.exports = function () {
  const router = new Router();
  router.post('/', create);
  return router;
};
