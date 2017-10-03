const path = require('path');
const fs = require('fs');
const logger = require('winston');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  // Does not mean Tsinghua's password
  password: {type: String},
  studentId: {type: String, index: true},
  username: {type: String, index: true, required: true},
  realname: {type: String},
  avatar: {type: String},
  department: {type: String},
  email: {type: String},
  createAt: {type: Date},
  role: {type: Number, enum: [0, 1, 2, 3, 4], required: true, default: 0},

  wechatId: {type: Schema.Types.ObjectId, ref: 'wechatUsers'}
});

userSchema.virtual('requirePasswordReset')
  .get(function() { return this.password === undefined; })
  .set(function(v) {
    if (v)
      delete this.password;
  });

userSchema.methods.setPassword = async function (password) {
  this.password = await bcrypt.hash(password, 10);
};

userSchema.methods.checkPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.toPlainObject = function () {
  return {
    _id: this._id,
    studentId: this.studentId,
    username: this.username,
    realname: this.realname,
    avatar: '/uploads/' + this.avatar,
    department: this.department,
    createAt: this.createAt,
    role: this.role,
    wechatId: this.wechatId,
    requirePasswordReset: this.requirePasswordReset
  };
};

userSchema.statics.mapIdTsinghua = function (info) {
  if (info.ss === undefined || info.ss.account === undefined)
    return null;
  const account = info.ss.account;
  if (account.username === undefined || account.userId === undefined)
    return null;
  let result = {};
  if (account.username)
    result.username = account.username;
  if (account.userId)
    result.studentId = account.userId;
  if (account.realName)
    result.realname = account.realName;
  if (account.deptString)
    result.department = account.deptString;
  return result;
};

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
