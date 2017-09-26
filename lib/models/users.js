const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const usersSchema = new mongoose.Schema({
  password: {type: String},
  avatar: {type: String},

  tsinghuaInfoUpdateAt: {type: Date},
  wechatInfoUpdateAt: {type: Date},

  // id.tsinghua information
  studentId: {type: String, index: true},
  studentUsername: {type: String, index: true},
  realName: {type: String},
  department: {type: String},

  // wechat information
  openId: {type: String, index: true},
  unionId: {type: String, index: true},
  wechatSubscribe: {type: Boolean},
  wechatNickname: {type: String},
  wechatGender: {type: Number, enum: [0, 1, 2]},
  wechatAvatar: {type: String}
});

module.exports = function (app) {
  const logger = app.context.logger;

  function errLogger(err) {
    if (err) {
      logger.error('Failed to delete an unused file for `users` model.');
      logger.error(err);
    }
  }

  usersSchema.post('init', function (doc) {
    doc.originAvatar = doc.avatar;
    doc.originWechatAvatar = doc.wechatAvatar;
  });

  usersSchema.post('save', function (doc) {
    if (doc.originAvatar !== doc.avatar &&
        doc.originAvatar !== undefined)
      fs.unlink(path.join('uploads', doc.originAvatar), errLogger);
    if (doc.originWechatAvatar !== doc.wechatAvatar &&
        doc.originWechatAvatar !== undefined)
      fs.unlink(path.join('uploads', doc.originWechatAvatar), errLogger);
    delete doc.originAvatar;
    delete doc.originWechatAvatar;
  });

  usersSchema.post('remove', function (doc) {
    if (doc.originAvatar !== undefined)
      fs.unlink(path.join('uploads', doc.originAvatar), errLogger);
    if (doc.originWechatAvatar !== undefined)
      fs.unlink(path.join('uploads', doc.originWechatAvatar), errLogger);
    delete doc.originAvatar;
    delete doc.originWechatAvatar;
  });


  return mongoose.model('users', usersSchema);
};
