const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {addFileFields, addSocketHook, addUpdatedAt, addCreatedAt, addDeleted} =
  require('./utils');

module.exports = function (db, sio) {
  const activitySchema = new Schema({
    name: {type: String, required: true},
    shortName: {type: String, required: true},
    place: {type: String},
    beginTime: {type: Date, index: true},
    endTime: {type: Date},
    bookBeginTime: {type: Date, index: true},
    bookEndTime: {type: Date},
    description: {type: String},
    excerption: {type: String},
    mainImage: {type: String},
    titleImage: {type: String},
    mainImageThumbnail: {type: String},
    titleImageThumbnail: {type: String},
    totalTickets: {type: Number, required: true},
    remainTickets: {type: Number},
    checkedTickets: {type: Number},
    createdAt: {type: Date},
    updatedAt: {type: Date},
    published: {type: Boolean, index: true, default: false},
    deleted: {type: Boolean, index: true},
    creator: {type: Schema.Types.ObjectId, ref: 'users', required: true}
  });

  addCreatedAt(activitySchema);
  addUpdatedAt(activitySchema, 'updatedAt', {
    disableUpdateHook: true
  });
  addDeleted(activitySchema);
  addFileFields(activitySchema, [
    'mainImage', 'mainImageThumbnail',
    'titleImage', 'titleImageThumbnail'
  ]);
  if (sio)
    addSocketHook(activitySchema, sio, 'activities', function (doc) {
      if (doc.published)
        return ['users'];
      else
        return ['user:' + doc.creator];
    }, function (doc) {
      return doc.toPlainObject();
    });

  activitySchema.methods.toPlainObject = function () {
    const result = {};
    ['name', 'shortName', 'place', 'beginTime', 'endTime', 'bookBeginTime',
      'bookEndTime', 'description', 'excerption', 'totalTickets', 'remainTickets',
      'createdAt', 'updatedAt', 'published', 'deleted', 'creator', 'checkedTickets',
      '_id'].forEach(x => {
        result[x] = this[x];
    });
    ['mainImage', 'titleImage', 'mainImageThumbnail', 'titleImageThumbnail'].forEach(x => {
      result[x] = '/uploads/' + this[x];
    });
    return result;
  };

  return db.model('activities', activitySchema);
};
