const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {addSocketHook, addUpdatedAt, addCreatedAt, addDeleted} = require('./utils');

module.exports = function (db, sio) {
  const ticketSchema = new Schema({
    owner: {type: Schema.Types.ObjectId, ref: 'users', required: true, index: true},
    activity: {type: Schema.Types.ObjectId, ref: 'activities', required: true},
    // cancel, okay, used
    status: {type: Number, enum: [0, 1, 2], required: true},
    createdAt: {type: Date},
    updatedAt: {type: Date},
    deleted: {type: Boolean, index: true},
  });

  ticketSchema.index({activity: 1, owner: 1}, {
    unique: true,
    partialFilterExpression: {deleted: false}
  });

  addCreatedAt(ticketSchema);
  addUpdatedAt(ticketSchema, 'updatedAt', {
    disableUpdateHook: true
  });
  addDeleted(ticketSchema);
  if (sio)
    addSocketHook(ticketSchema, sio, 'tickets', function (doc) {
      return ['user:' + doc.owner];
    }, function (doc) {
      return doc.toPlainObject();
    });

  ticketSchema.methods.toPlainObject = function () {
    const result = {};
    ['_id', 'owner', 'activity', 'status',
      'createdAt', 'updatedAt'].forEach(x => {
      result[x] = this[x];
    });
    return result;
  };

  return db.model('tickets', ticketSchema);
};
