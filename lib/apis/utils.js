const ajv = new (require('ajv'))();
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('koa-multer');
const createError = require('http-errors');
const logger = require('winston');
const {randomAlnumString, filenameFromMineType, makeThumbnail} =
  require('../models/utils');

function httpThrow(code, data) {
  data.code = code;
  throw createError(code, JSON.stringify(data));
}

function httpValidate(schema, data) {
  if (!schema(data))
    httpThrow(400, {
      type: 'ESCHEMA',
      message: ajv.errorsText(schema.errors),
      data: schema.errors
    });
}

function httpAssert(predict, code, data) {
  if (!predict)
    httpThrow(code, data);
}

function copyBody(fields) {
  if (!fields)
    fields = {};
  return function (ctx, next) {
    if (ctx.req.body) {
      const body = {};
      try {
        Object.keys(ctx.req.body).forEach(function (key) {
          if (fields[key])
            body[key] = fields[key](ctx.req.body[key]);
          else
            body[key] = ctx.req.body[key];
        });
      } catch (err) {
        ctx.throw(400, JSON.stringify({
          code: 400,
          type: 'ESCHEMA',
          message: 'Wrong field type'
        }));
      }
      ctx.request.body = body;
    }
    return next();
  };
}

function multerOptions(types, maxSize) {
  const options = {
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'uploads');
      },
      filename: function (req, file, cb) {
        cb(null, filenameFromMineType(file.mimetype));
      }
    }),
    fileFilter: function (req, file, cb) {
      if (types && types.indexOf(file.mimetype) === -1)
        cb(createError(400, JSON.stringify({
          code: 400,
          type: 'ESCHEMA',
          message: 'Wrong file type'
        })));
      else
        cb(null, true)
    }
  };
  if (maxSize)
    options.limits = {fileSize: maxSize};
  return options;
}

function wrapMulterError(ctx, next) {
  return next().catch(function (err) {
    switch (err.message) {
      case 'File too large':
        ctx.throw(400, JSON.stringify({
          code: 400,
          type: 'ESCHEMA',
          message: 'File too large'
        }));
        break;
      default:
        throw err;
    }
  });
}

function cleanFileOnError(ctx, next) {
  ctx.files = [];
  if (ctx.req.file)
    ctx.files.push(ctx.req.file.path);
  if (Array.isArray(ctx.req.files))
    for (let file of ctx.req.files)
      ctx.files.push(file.path);
  else if (typeof ctx.req.files === 'object')
    Object.values(ctx.req.files).forEach(function (files) {
      for (let file of files)
        ctx.files.push(file.path);
    });
  return next().catch(function (err) {
    for (let file of ctx.files) {
      fs.unlink(file, function (err) {
        if (err) {
          logger.error(`Failed to delete file "${file}".`);
          logger.error(err);
        }
      });
    }
    throw err;
  });
}

async function getAuthorization(ctx) {
  try {
    let token = ctx.headers['authorization'];
    if (!token)
      return null;
    token = token.split(/\s+/);
    token = token[token.length - 1];

    const secretKey = await ctx.models.global.getSecretKey();
    return await new Promise(function (resolve, reject) {
      jwt.verify(token, secretKey, function (err, decoded) {
        if (err)
          reject(err);
        else
          resolve(decoded);
      });
    });
  } catch (err) {
    console.log(err);
    return null;
  }
}

async function mergeUserToken(data, sess) {
  Object.keys(sess).forEach(function(key) {
    if (key === 'roles') {
      if (!data[key])
        data[key] = [];
      for (let role of JSON.parse(sess[key]))
        if (data[key].indexOf(role) === -1)
          data[key].push(role);
    } else if (data[key] === undefined)
      data[key] = sess[key];
  });
}

function hashify(link) {
  return link.origin + '/#' + link.pathname + link.search + link.hash;
}

module.exports = {
  httpThrow,
  httpValidate,
  httpAssert,
  copyBody,
  multerOptions,
  wrapMulterError,
  cleanFileOnError,
  makeThumbnail,
  getAuthorization,
  mergeUserToken,
  hashify
};
