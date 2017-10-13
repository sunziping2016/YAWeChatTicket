const request = require('request');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const mime = require('mime-types');
const logger = require('winston');

function randomAlnumString(length) {
  const chars = '0123456789' +
    'abcdefghijklmnopqrstuvwxyz' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; ++i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function filenameFromMineType(mimetype, basename) {
  if (!basename)
    basename = randomAlnumString(40);
  const ext = mime.extension(mimetype);
  if (ext)
    basename += '.' + ext;
  return basename;
}

async function fetchFile(url, destination) {
  return new Promise(function (resolve, reject) {
    const req = request.get(url)
      .on('response', function(response) {
        if (!destination)
          destination = filenameFromMineType(response.headers['content-type']);
        req.pipe(fs.createWriteStream(path.join('uploads', destination)))
          .on('error', reject)
          .on('finish', function () {
            resolve(destination);
          });
      })
      .on('error', reject);
  });
}

function makeThumbnail(source, destination, size) {
  if (!destination)
    destination = randomAlnumString(40) + '.png';
  if (!size)
    size = [64, 64];
  return sharp(path.join('uploads', source))
    .resize(size[0], size[1])
    .toFile(path.join('uploads', destination))
    .then(function () {
      return destination;
    });
}

function redisify(object) {
  let result = [];
  for (let key in object) {
    if (!object.hasOwnProperty(key))
      continue;
    result.push(key);
    if (typeof object[key] === 'object')
      result.push(JSON.stringify(object[key]));
    else
      result.push(object[key]);
  }
  return result;
}

function addUpdatedAt(schema, field) {
  if (!field)
    field = 'updatedAt';
  schema.pre('save', function (next) {
    if (this.isModified())
      this[field] = new Date();
    next();
  });
  schema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate();
    update[field] = new Date();
  });
  schema.pre('update', function () {
    const update = this.getUpdate();
    update[field] = new Date();
  });
}

function addCreatedAt(schema, field) {
  if (!field)
    field = 'createdAt';
  schema.pre('save', function (next) {
    if (this.isNew)
      this[field] = new Date();
    next();
  });
  schema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate();
    update['$setOnInsert'] = update['$setOnInsert'] || {};
    update['$setOnInsert'][field] = new Date();
  });
  schema.pre('update', function () {
    const update = this.getUpdate();
    update[field] = new Date();
    update['$setOnInsert'] = update['$setOnInsert'] || {};
    update['$setOnInsert'][field] = new Date();
  });
}

function addDeleted(schema, field) {
  if (!field)
    field = 'deleted';
  schema.query.deleted = function (deleted) {
    return this.where(field).eq(true);
  };
  schema.query.notDeleted = function () {
    return this.where(field).ne(true);
  };
  schema.methods.delete = function () {
    this[field] = true;
    return this.save();
  }
}

function addSocketHook(schema, sio, label, getAudience, getData) {
  if (!getData)
    getData = function (x) {return x;};
  schema.post('save', function (doc) {
    const audiences = getAudience(doc);
    if (!audiences || audiences.length === 0)
      return;
    const msg = doc.deleted ? 'delete' : 'update',
      data = doc.deleted ? doc._id : getData(doc);
    for (let audience of audiences)
      sio.to(audience);
    sio.emit(`${label}:${msg}`, data);
  });

  schema.post('remove', function (doc) {
    const audiences = getAudience(doc);
    if (!audiences || audiences.length === 0)
      return;
    for (let audience of audiences)
      sio = sio.to(audience);
    sio.emit(`${label}:delete`, doc._id);
  });
}

function addFileFields(schema, fields) {
  if (fields.length === 0)
    return;
  function errLogger(filename) {
    return function (err) {
      if (err) {
        logger.error(`Failed to delete file "${filename}".`);
        logger.error(err);
      }
    }
  }
  schema.post('init', function (doc) {
    for (let field of fields)
      doc['_' + field] = doc[field];
  });
  schema.post('save', function (doc) {
    for (let field of fields) {
      const oldFilename = doc['_' + field];
      if (oldFilename && oldFilename !== doc[field])
        fs.unlink(path.join('uploads', oldFilename), errLogger(oldFilename));
    }
  });

  schema.post('remove', function (doc) {
    for (let field of fields) {
      const oldFilename = doc['_' + field];
      if (oldFilename)
        fs.unlink(path.join('uploads', oldFilename), errLogger(oldFilename));
    }
  });
}

module.exports = {
  randomAlnumString,
  fetchFile,
  redisify,
  makeThumbnail,
  filenameFromMineType,
  addUpdatedAt,
  addCreatedAt,
  addDeleted,
  addSocketHook,
  addFileFields
};
