const Router = require('koa-router');
const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, getAuthorization} = require('./utils');

const idRegex = /^[a-f\d]{24}$/i;

const createTicketSchema = ajv.compile({
  type: 'object',
  required: ['activity'],
  properties: {
    activity: {type: 'string', pattern: '^[a-f\\d]{24}$'},
  },
  additionalProperties: false
});

async function create(ctx) {
  const data = ctx.request.body,
    {tickets, activities} = ctx.models;
  httpValidate(createTicketSchema, data);
  const token = await getAuthorization(ctx);
  httpAssert(token && token.uid && token.role && token.role & 0b1, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  data.owner = token.uid;
  data.status = 1;
  const ticket = await new Promise(function (resolve, reject) {
    tickets.findOneAndUpdate({
      activity: data.activity,
      owner: data.owner
    }, {
      $setOnInsert: data
    }, {
      upsert: true,
      new: true,
      passRawResult: true
    }).notDeleted().exec(
      function (err, result, raw) {
        if (err)
          reject(err);
        else if (raw.lastErrorObject.updatedExisting)
          resolve(null);
        else
          resolve(result);
      }
    );
  });
  activities.findOneAndUpdate({

  });
  httpAssert(ticket, 400, {
    type: 'ESCHEMA',
    message: 'One user can only have one ticket.'
  });
  ctx.body = {
    code: 200,
    type: 'OK'
  }
}

module.exports = function () {
  const router = new Router();
  router.post('/', create);
  return router;
};
