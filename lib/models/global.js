const mongoose = require('mongoose');
const WechatAPI = require('co-wechat-api');
const crypto = require('crypto');
const process = require('process');

let wechat = null;

const globalSchema = new mongoose.Schema({
  wechatAppid: {type: String},
  wechatAppsecret: {type: String},
  wechatAccessToken: {type: String},
  wechatAccessTokenExpireAt: {type: Date},
  jwtSecretKey: {type: Buffer}
}, {collection: 'global'});


globalSchema.statics.get = async function() {
  const result = await this.findOne();
  if (result === null)
    return new this;
  else
    return result;
};

globalSchema.statics.getWechat = function() {
  return wechat;
};

globalSchema.statics.getWechatToken = async function () {
  const document = await this.get();
  if (document.wechatAccessToken !== undefined &&
    document.wechatAccessTokenExpireAt !== undefined)
    return {
      accessToken: document.wechatAccessToken,
      expireTime: document.wechatAccessTokenExpireAt.getTime()
    };
  else
    return null;
};

globalSchema.statics.setWechatToken = async function (token) {
  const document = await this.get();
  document.wechatAccessToken = token.accessToken;
  document.wechatAccessTokenExpireAt = new Date(token.expireTime);
  await document.save();
};

globalSchema.statics.getSecretKey = async function () {
  return (await this.get()).jwtSecretKey;
};

module.exports = async function (config) {
  const model = mongoose.model('global', globalSchema);
  if (process.env.WORKER_INDEX === '0') {
    let document = await model.get();
    if (config.wechat.appid !== document.wechatAppid ||
      config.wechat.appsecret !== document.wechatAppsecret) {
      document.wechatAppid = config.wechat.appid;
      document.wechatAppsecret = config.wechat.appsecret;
      document.wechatAccessToken = undefined;
      document.wechatAccessTokenExpireAt = undefined;
    }
    if (document.jwtSecretKey === undefined) {
      document.jwtSecretKey = await new Promise(function (resolve, reject) {
        crypto.randomBytes(256, function(err, buf) {
          if (err)
            reject(err);
          else
            resolve(buf);
        });
      });
    }
    await document.save();
  }
  wechat = new WechatAPI(
    config.wechat.appid, config.wechat.appsecret,
    async function() {
      return await model.getWechatToken();
    },
    async function (token) {
      await model.setWechatToken(token);
    });
  return model;
};
