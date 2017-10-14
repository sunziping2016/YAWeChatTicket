const path = require('path');
const Router = require('koa-router');
const multer = require('koa-multer');
const compose = require('koa-compose');
const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, copyBody, multerOptions, wrapMulterError,
  cleanFileOnError, makeThumbnail, getAuthorization} =
  require('./utils');

const maxImageSize = 10 * 1024 * 1024,
  idRegex = /^[a-f\d]{24}$/i;

const createActivitySchema = ajv.compile({
  type: 'object',
  required: ['name', 'beginTime', 'endTime',
    'bookBeginTime', 'bookEndTime', 'totalTickets'],
  properties: {
    name: {type: 'string', maxLength: 20},
    shortName: {type: 'string', maxLength: 20},
    place: {type: 'string', maxLength: 20},
    beginTime: {type: 'string', format: 'date-time'},
    endTime: {type: 'string', format: 'date-time'},
    bookBeginTime: {type: 'string', format: 'date-time'},
    bookEndTime: {type: 'string', format: 'date-time'},
    description: {type: 'string'},
    excerption: {type: 'string', maxLength: 100},
    totalTickets: {type: 'integer'},
    published: {type: 'boolean', default: false}
  },
  additionalProperties: false
});

async function create(ctx) {
  const data = ctx.request.body,
    {mainImage, titleImage} = ctx.req.files || {},
    {activities} = ctx.models;
  httpValidate(createActivitySchema, data);
  ['beginTime', 'endTime', 'bookBeginTime', 'bookEndTime'].forEach(function (field) {
    data[field] = new Date(data[field]);
  });
  httpAssert(data.beginTime.getTime() < data.endTime.getTime(),
    data.bookBeginTime.getTime() < data.bookEndTime.getTime(), 400, {
    type: 'ESCHEMA',
    message: 'Invalid date'
  });
  httpAssert(mainImage && mainImage[0] && titleImage && titleImage[0], 400, {
    type: 'ESCHEMA',
    message: 'Requires images'
  });
  const token = await getAuthorization(ctx);
  httpAssert(token && token.uid && token.role && token.role & 0b10, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  data.creator = token.uid;
  data.remainTickets = data.totalTickets;
  data.mainImage = mainImage[0].filename;
  data.titleImage = titleImage[0].filename;
  [data.mainImageThumbnail, data.titleImageThumbnail] = await Promise.all([
    makeThumbnail(mainImage[0].filename, null, [600, 800]),
    makeThumbnail(titleImage[0].filename, null, [800, 600])
  ]);
  ctx.files.push(path.join('uploads', data.mainImageThumbnail));
  ctx.files.push(path.join('uploads', data.titleImageThumbnail));
  const activity = new activities(data);
  await activity.save();
  ctx.body = {
    code: 200,
    type: 'OK',
    data: activity.toPlainObject()
  };
}

const findActivitySchema = ajv.compile({
  type: 'object',
  properties: {
    published: {type: 'string', enum: ['true', 'false']},
    limit: {type: 'string', enum: ['5', '10', '15', '20', '25'], default:'10'},
    lastBeginTime: {type: 'string', format: 'date-time'},
    lastId: {type: 'string', pattern: '^[A-Fa-f\\d]{24}$'}
  },
  additionalProperties: false
});

async function find(ctx) {
  const data = ctx.query,
    {activities} = ctx.models,
    query = {};
  httpValidate(findActivitySchema, data);
  const limit = parseInt(data.limit || 10);
  if (data.published === 'true')
    query.published = true;
  else {
    const token = await getAuthorization(ctx);
    httpAssert(token && token.uid && token.role && token.role & 0b10, 401, {
      type: 'EAUTH',
      message: 'Authentication failed'
    });
    if (data.published === 'false') {
      query.published = false;
      query.creator = token.uid;
    } else
      query.$or = [
        {published: true},
        {creator: token.uid}
      ];
  }
  if (data.lastBeginTime)
    query.beginTime = {$lte: new Date(data.lastBeginTime)};
  if (data.lastId)
    query._id = {$lt: data.lastId};
  const results = await activities.find(query).notDeleted()
    .sort({beginTime: -1, _id: -1})
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

async function getActivity(ctx) {
  const id = ctx.params.id,
    {activities} = ctx.models;
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Invalid id'
  });
  const activity = await activities.findById(id).notDeleted();
  httpAssert(activity, 400, {
    type: 'ESCHEMA',
    message: 'Activity does not exist'
  });
  if (!activity.published) {
    const token = await getAuthorization(ctx);
    httpAssert(token && token.uid && String(activity.creator) === token.uid, 401, {
      type: 'EAUTH',
      message: 'Authentication failed'
    });
  }
  ctx.body = {
    code: 200,
    type: 'OK',
    data: activity.toPlainObject()
  };
}


const patchActivitySchema = ajv.compile({
  type: 'object',
  properties: {
    name: {type: 'string', maxLength: 20},
    shortName: {type: 'string', maxLength: 20},
    place: {type: 'string', maxLength: 20},
    beginTime: {type: 'string', format: 'date-time'},
    endTime: {type: 'string', format: 'date-time'},
    bookBeginTime: {type: 'string', format: 'date-time'},
    bookEndTime: {type: 'string', format: 'date-time'},
    description: {type: 'string'},
    excerption: {type: 'string', maxLength: 100},
    published: {type: 'boolean', default: false}
  },
  additionalProperties: false
});

async function patch(ctx) {
  const id = ctx.params.id,
    data = ctx.request.body,
    {mainImage, titleImage} = ctx.req.files || {},
    {activities} = ctx.models;
  httpValidate(patchActivitySchema, data);
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Invalid id'
  });
  ['beginTime', 'endTime', 'bookBeginTime', 'bookEndTime'].forEach(function (field) {
    if (data[field])
      data[field] = new Date(data[field]);
  });
  const [token, activity] = await Promise.all([
    getAuthorization(ctx),
    activities.findById(id).notDeleted()
  ]);
  httpAssert(activity, 400, {
    type: 'ESCHEMA',
    message: 'Activity does not exist'
  });
  httpAssert(token && token.uid && String(activity.creator) === token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  if (mainImage) {
    data.mainImage = mainImage[0].filename;
    data.mainImageThumbnail = await makeThumbnail(mainImage[0].filename, null, [600, 800]);
    ctx.files.push(path.join('uploads', data.mainImageThumbnail));
  }
  if (titleImage) {
    data.titleImage = titleImage[0].filename;
    data.titleImageThumbnail = await makeThumbnail(titleImage[0].filename, null, [600, 800]);
    ctx.files.push(path.join('uploads', data.titleImageThumbnail));
  }
  Object.keys(data).forEach(function (key) {
    activity[key] = data[key];
  });
  httpAssert(activity.beginTime.getTime() < activity.endTime.getTime(),
    activity.bookBeginTime.getTime() < activity.bookEndTime.getTime(), 400, {
    type: 'ESCHEMA',
    message: 'Invalid date'
  });
  await activity.save();
  ctx.body = {
    code: 200,
    type: 'OK',
    data: activity.toPlainObject()
  };
}


async function deleteActivity(ctx) {
  const id = ctx.params.id,
    {activities} = ctx.models,
    token = await getAuthorization(ctx);
  httpAssert(id && idRegex.test(id), 401, {
    type: 'ESCHEMA',
    message: 'Invalid id'
  });
  const activity = await activities.findById(id).notDeleted();
  httpAssert(activity, 400, {
    type: 'ESCHEMA',
    message: 'Activity does not exist'
  });
  httpAssert(token && token.uid && String(activity.creator) === token.uid, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  await activity.delete();
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

module.exports = function () {
  const router = new Router(),
    multipart = compose([
      wrapMulterError,
      multer(multerOptions(['image/png', 'image/gif',
        'image/jpeg'], maxImageSize)).fields([
        {name: 'mainImage', maxCount: 1},
        {name: 'titleImage', maxCount: 1}
      ]),
      cleanFileOnError,
      copyBody({
        totalTickets: parseInt,
        published: x => x === 'true'
      })
    ]);
  router.post('/', multipart, create);
  router.get('/', find);
  router.get('/:id', getActivity);
  router.patch('/:id', multipart, patch);
  router.delete('/:id', deleteActivity);
  return router;
};
