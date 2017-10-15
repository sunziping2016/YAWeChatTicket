const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, httpThrow, getAuthorization} =
  require('../apis/utils');

const createTicketSchema = ajv.compile({
  type: 'object',
  required: ['activity'],
  properties: {
    activity: {type: 'string', pattern: '^[A-Fa-f\\d]{24}$'},
  },
  additionalProperties: false
});

async function create(data, {tickets, activities, token, io, uid}) {
  httpValidate(createTicketSchema, data);
  data.owner = token && token.uid || uid;
  data.status = 1;
  let updatedExisting = true;
  const ticket = await new Promise(function (resolve, reject) {
    tickets.findOneAndUpdate({
      activity: data.activity,
      owner: data.owner,
      $or: [
        {status: 0},
        {deleted: false, status: 1}
      ]
    }, {
      $setOnInsert: data
    }, {
      upsert: true,
      new: true,
      passRawResult: true
    }).exec(
      function (err, result, raw) {
        if (err)
          reject(err);
        else {
          updatedExisting = raw.lastErrorObject.updatedExisting;
          resolve(result);
        }
      }
    );
  });
  httpAssert(!updatedExisting, 400, {
    type: 'ESCHEMA',
    message: 'One user can only have one ticket',
    data: {
      deleted: ticket.deleted,
      data: ticket.deleted ? ticket._id : ticket.toPlainObject()
    }
  });
  const now = new Date();
  const activity = await activities.findOneAndUpdate({
    _id: data.activity,
    published: true,
    remainTickets: {$gt: 0},
    bookBeginTime: {$lte: now},
    bookEndTime: {$gte: now}
  }, {
    $inc: {remainTickets: -1}
  }).notDeleted();

  if (!activity) {
    await ticket.remove();
    httpThrow(400, {
      type: 'ESCHEMA',
      message: 'Invalid activity'
    });
  }
  ticket.markModified('updatedAt');
  // For updated, created and notification
  await ticket.save();
  return {
    code: 200,
    type: 'OK',
    data: ticket.toPlainObject()
  };
}

module.exports = {
  create
};
