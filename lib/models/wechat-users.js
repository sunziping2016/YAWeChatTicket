const path = require('path');
const fs = require('fs');
const logger = require('winston');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {fetchFile} = require('./utils');

const wechatUserSchema = new Schema({
  _id: {type: String},
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
  if (info.openid)
    result._id = result.openId = info.openid;
  if (info.unionid)
    result.unionId = info.unionid;
  if (info.subscribe)
    result.subscribe = info.subscribe === 1;
  if (result.subscribe) {
    if (info.nickname)
      result.nickname = info.nickname;
    if (info.sex)
      result.gender = info.sex;
    if (info.headimgurl)
      result.avatar = await fetchFile(info.headimgurl);
  }
  return result;
};

wechatUserSchema.methods.toPlainObject = function () {
  return {
    updateAt: this.updateAt,
    openId: this.openId,
    unionId: this.unionId,
    nickname: this.nickname,
    gender: this.gender,
    avatar: '/uploads/' + this.avatar,
    subscribe: this.subscribe,

    userId: this.userId
  };
};

module.exports = function () {
  return mongoose.model('wechatUsers', wechatUserSchema);
};
