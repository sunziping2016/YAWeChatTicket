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

const findActivitySchema = ajv.compile({
  type: 'object',
  properties: {
    lastId: {type: 'string', pattern: '^[A-Fa-f\\d]{24}$'},
    limit: {type: 'string', enum: ['5', '10', '15', '20', '25'], default:'10'}
  },
  additionalProperties: false
});

async function find(ctx) {
  const data = ctx.query,
    token = await getAuthorization(ctx),
    {tickets} = ctx.models,
    limit = parseInt(data.limit) || 10,
    query = {};
  httpAssert(token && token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  query.owner = token.uid;
  if (data.lastId)
    query._id = {$lt: data.lastId};
  const results = await tickets.find(query)
    .notDeleted()
    .sort({_id: -1})
    .limit(limit);
  ctx.body = {
    code: 200,
    type: 'OK',
    data: {
      results: results.map(x => x.toPlainObject()),
      length: results.length,
      limit: limit
    }
  };
}

async function getTicket(ctx) {
  const id = ctx.params.id,
    {tickets} = ctx.models,
    token = await getAuthorization(ctx);
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Invalid id'
  });
  const ticket = await tickets.findById(id).notDeleted();
  httpAssert(ticket, 400, {
    type: 'ESCHEMA',
    message: 'Ticket does not exist'
  });
  httpAssert(token && token.uid && String(ticket.owner) === token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  ctx.body = {
    code: 200,
    type: 'OK',
    data: ticket.toPlainObject()
  };
}

async function deleteTicket(ctx) {
  const id = ctx.params.id,
    {tickets, activities} = ctx.models,
    token = await getAuthorization(ctx);
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Invalid id'
  });
  const ticket = await tickets.findById(id).notDeleted();
  httpAssert(ticket, 400, {
    type: 'ESCHEMA',
    message: 'Ticket does not exist'
  });
  httpAssert(token && token.uid && String(ticket.owner) === token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  if (ticket.status === 1) {
    await activities.findOneAndUpdate({
      _id: ticket.activity
    }, {
      $inc: {remainTickets: 1}
    });
  }
  await ticket.delete();
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

module.exports = function () {
  const router = new Router();
  router.post('/', create);
  router.get('/', find);
  router.get('/:id', getTicket);
  router.delete('/:id', deleteTicket);
  return router;
};
