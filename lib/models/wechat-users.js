const path = require('path');
const fs = require('fs');
const logger = require('winston');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {fetchFile} = require('./utils');

const wechatUserSchema = new Schema({
  updateAt: {type: Date},
  openId: {type: String, index: true},
  unionId: {type: String, index: true},
  nickname: {type: String},
  gender: {type: Number, enum: [0, 1, 2]},
  avatar: {type: String},
  subscribe: {type: Boolean},

  userId: {type: Schema.Types.ObjectId, ref: 'users'}
});

function errLogger(err) {
  if (err) {
    logger.error('Failed to delete old avatar for Wechat user.');
    logger.error(err);
  }
}

wechatUserSchema.post('init', function (doc) {
  doc.originAvatar = doc.avatar;
});

wechatUserSchema.post('save', function (doc) {
  if (doc.originAvatar !== doc.avatar &&
    doc.originAvatar !== undefined)
    fs.unlink(path.join('uploads', doc.originAvatar), errLogger);
  delete doc.originAvatar;
});

wechatUserSchema.post('remove', function (doc) {
  if (doc.originAvatar !== undefined)
    fs.unlink(path.join('uploads', doc.originAvatar), errLogger);
  delete doc.originAvatar;
});


wechatUserSchema.statics.mapWechat = async function (info) {
  let result = {};
  result.updateAt = new Date();
  result.openId = info.openid;
  result.unionId = info.unionid;
  result.subscribe = info.subscribe === 1;
  if (result.subscribe) {
    result.nickname = info.nickname;
    result.gender = info.sex;
    result.avatar = await fetchFile(info.headimgurl);
  }
  return result;
};

module.exports = function () {
  return mongoose.model('wechatUsers', wechatUserSchema);
};
