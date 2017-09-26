const mongoose = require('mongoose');

const globalSchema = new mongoose.Schema({
  wechatAppId: {type: String},
  wechatAppSecret: {type: String},
  wechatAccessToken: {type: String},
  wechatAccessTokenExpireAt: {type: Date}
});

globalSchema.statics.getGlobal = async function() {
  const result = await this.findOne();
  if (result === null)
    return new this;
  else
    return result;
};

module.exports = async function (config) {
  const model = mongoose.model('global', globalSchema);
  const document = await model.getGlobal();

  if (config.wechat.appid !== document.wechatAppId ||
      config.wechat.appsecret !== document.wechatAppSecret) {
    document.wechatAppId = config.wechat.appid;
    document.wechatAppSecret = config.wechat.appsecret;
    document.wechatAccessToken = undefined;
    document.wechatAccessTokenExpireAt = undefined;
    await document.save();
  }
  return model;
};
