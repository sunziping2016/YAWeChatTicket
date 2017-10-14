const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {addFileFields, addSocketHook, addUpdatedAt, addCreatedAt,
  fetchFile, makeThumbnail} = require('./utils');

module.exports = function (db, sio) {
  const wechatUserSchema = new Schema({
    _id: {type: String, alias: 'openId', required: true},
    unionId: {type: String},
    subscribe: {type: Boolean},
    nickname: {type: String},
    avatar: {type: String},
    avatarThumbnail: {type: String},
    gender: {type: Number, enum: [0, 1, 2]},
    createdAt: {type: Date},
    updatedAt: {type: Date},
    blocked: {type: Boolean},

    userId: {type: Schema.Types.ObjectId, ref: 'users'}
  });

  addCreatedAt(wechatUserSchema);
  addUpdatedAt(wechatUserSchema);
  addFileFields(wechatUserSchema, ['avatar', 'avatarThumbnail']);
  if (sio)
    addSocketHook(wechatUserSchema, sio, 'wechatUsers', function (doc) {
      return [
        'wechat-user:' + doc._id,
        'administrators'
      ];
    }, function (doc) {
      return doc.toPlainObject();
    });

  wechatUserSchema.pre('save', function (next) {
    next();
  });

  wechatUserSchema.methods.toPlainObject = function () {
    return {
      openId: this.openId,
      unionId: this.unionId,
      subscribe: this.subscribe,
      nickname: this.nickname,
      avatar: this.avatar ? '/uploads/' + this.avatar : undefined,
      avatarThumbnail: this.avatarThumbnail ? '/uploads/' +
        this.avatarThumbnail : undefined,
      gender: this.gender,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      blocked: this.blocked,
      userId: this.userId
    };
  };

  wechatUserSchema.statics.mapWechat = async function (info) {
    let result = {};
    if (info.openid)
      result.openId = info.openid;
    if (info.unionid)
      result.unionId = info.unionid;
    if (info.subscribe)
      result.subscribe = info.subscribe === 1;
    if (result.subscribe) {
      if (info.nickname)
        result.nickname = info.nickname;
      if (info.headimgurl) {
        result.avatar = await fetchFile(info.headimgurl);
        result.avatarThumbnail = await makeThumbnail(result.avatar);
      }
      if (info.sex)
        result.gender = info.sex;
    }
    return result;
  };

  return db.model('wechatUsers', wechatUserSchema);
};
