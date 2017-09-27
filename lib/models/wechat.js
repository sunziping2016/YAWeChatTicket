const mongoose = require('mongoose');
const WechatAPI = require('co-wechat-api');

// Global Wechat Variable
let wechat = null;

const wechatSchema = new mongoose.Schema({
  wechatAppId: {type: String},
  wechatAppSecret: {type: String},
  wechatAccessToken: {type: String},
  wechatAccessTokenExpireAt: {type: Date}
}, {collection: 'wechat'});

wechatSchema.statics.get = async function() {
  const result = await this.findOne();
  if (result === null)
    return new this;
  else
    return result;
};

wechatSchema.statics.getToken = async function () {
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

wechatSchema.statics.setToken = async function (token) {
  const document = await this.get();
  document.wechatAccessToken = token.accessToken;
  document.wechatAccessTokenExpireAt = new Date(token.expireTime);
  await document.save();
};

wechatSchema.statics.getFollowers = async function () {
  let result = await wechat.getFollowers();
  if (result.data === undefined)
    return new Set();
  let followers = result.data.openid;
  while (followers.size < result.total && result.next_openid !== '') {
    result = await wechat.getFollowers(result.next_openid);
    if (result.data !== undefined)
      followers = followers.concat(result.data.openid);
  }
  return followers;
};

wechatSchema.statics.batchGetUsers = async function (followers) {
  let splittedFollowers = [], results = [];
  for (let i = 0; i < followers.length; i += 100)
    splittedFollowers.push(followers.slice(i, i + 100));
  await Promise.all(splittedFollowers.map(function (openids) {
    return wechat.batchGetUsers(openids).then(function (data) {
      results = results.concat(data.user_info_list);
    });
  }));
  return results;
};

wechatSchema.statics.getUser = function (openid) {
  return wechat.getUser(openid);
};

module.exports = async function (config) {
  const model = mongoose.model('wechat', wechatSchema);
  let document = await model.get();
  if (config.wechat.appid !== document.wechatAppId ||
    config.wechat.appsecret !== document.wechatAppSecret) {
    document.wechatAppId = config.wechat.appid;
    document.wechatAppSecret = config.wechat.appsecret;
    document.wechatAccessToken = undefined;
    document.wechatAccessTokenExpireAt = undefined;
  }
  await document.save();
  wechat = new WechatAPI(
    config.wechat.appid, config.wechat.appsecret,
    async function() {
      return await model.getToken();
    },
    async function (token) {
      await model.setToken(token);
    });
  return model;
};


