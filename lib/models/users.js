const path = require('path');
const fs = require('fs');
const logger = require('winston');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  password: {type: String}, // has nothing to do with Tsinghua's password
  studentId: {type: String, index: true},
  username: {type: String, index: true},
  realname: {type: String},
  avatar: {type: String},
  department: {type: String},
  createAt: {type: Date},
  updateAt: {type: Date},

  wechatId: {type: Schema.Types.ObjectId, ref: 'wechatUsers'}
});

function errLogger(err) {
  if (err) {
    logger.error('Failed to delete an old avatar for user.');
    logger.error(err);
  }
}

userSchema.post('init', function (doc) {
  doc.originAvatar = doc.avatar;
});

userSchema.post('save', function (doc) {
  if (doc.originAvatar !== doc.avatar &&
    doc.originAvatar !== undefined)
    fs.unlink(path.join('uploads', doc.originAvatar), errLogger);
  delete doc.originAvatar;
});

userSchema.post('remove', function (doc) {
  if (doc.originAvatar !== undefined)
    fs.unlink(path.join('uploads', doc.originAvatar), errLogger);
  delete doc.originAvatar;
});

module.exports = function () {
  return mongoose.model('users', userSchema);
};
