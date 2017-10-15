const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, httpThrow, getAuthorization} =
  require('./utils');

const idRegex = /^[a-f\d]{24}$/i,
  sessionTokenExpire = 120; // 2min

const createSchema = ajv.compile({
  type: 'object',
  required: ['id'],
  properties: {
    id: {type: 'string', pattern: '^[A-Fa-f\\d]{24}$'}
  },
  additionalProperties: false
});

async function createTicketSession(ctx) {
  const data = ctx.query,
    {tickets, session} = ctx.models;
  httpValidate(createSchema, data);
  const ticket = await tickets.findById(data.id).notDeleted();
  httpAssert(ticket, 400, {
    type: 'ESCHEMA',
    message: 'Ticket does not exist'
  });
  httpAssert(ticket.status === 1, 400, {
    type: 'ESCHEMA',
    message: 'Ticket has been checked'
  });
  const token = await getAuthorization(ctx);
  httpAssert(token && token.uid && String(ticket.owner) === token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  const newToken = session.genToken();
  await session.save('ticket:' + newToken, data, sessionTokenExpire);
  ctx.body = {
    code: 200,
    type: 'OK',
    data: newToken
  }
}

const checkSchema = ajv.compile({
  type: 'object',
  required: ['token'],
  properties: {
    token: {type: 'string'}
  },
  additionalProperties: false
});

async function checkTicketSession(ctx) {
  const data = ctx.request.body,
    {tickets, activities, session} = ctx.models;
  const sess = await session.loadAndRemove('ticket:' + data.token);
  httpAssert(sess, 400, {
    type: 'ESCHEMA',
    message: 'Wrong token'
  });
  const ticket = await tickets.findById(sess.id).notDeleted();
  httpAssert(ticket, 400, {
    type: 'ticket',
    message: 'Ticket does not exist',
  });
  httpAssert(ticket.status === 1, 400, {
    type: 'ticket',
    message: 'Ticket has been checked',
  });
  let activity = await activities.findById(ticket.activity).notDeleted();
  httpAssert(activity, 400, {
    type: 'ESCHEMA',
    message: 'Activity does not exist',
  });
  const token = await getAuthorization(ctx);
  httpAssert(token && token.uid && String(activity.creator) === token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  ticket.status = 0;
  await ticket.save();
  activity = await activities.findOneAndUpdate({
    _id: activity._id
  }, {
    $inc: {checkedTickets: 1}
  }, {
    new: true
  });
  ctx.body = {
    code: 200,
    type: 'OK',
    data: activity.toPlainObject()
  }
}


module.exports = {
  createTicketSession,
  checkTicketSession
};
