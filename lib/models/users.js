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

module.exports = function () {
  return mongoose.model('users', usersSchema);
};
