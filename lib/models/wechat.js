const WechatAPI = require('co-wechat-api');

module.exports = function (model, config) {
  return new WechatAPI(
    config.wechat.appid, config.wechat.appsecret,
    async function() {
      const document = await model.getGlobal();
      if (document.wechatAccessToken && document.wechatAccessTokenExpireAt)
        return {
          accessToken: document.wechatAccessToken,
          expireTime: document.wechatAccessTokenExpireAt.getTime()
        };
      else
        return null;
    },
    async function (token) {
      const document = await model.getGlobal();
      if (document.wechatAccessToken !== token.accessToken &&
          (document.wechatAccessTokenExpireAt === undefined ||
           document.wechatAccessTokenExpireAt.getTime() !== token.expireTime)) {
        document.wechatAccessToken = token.accessToken;
        document.wechatAccessTokenExpireAt = new Date(token.expireTime);
        await document.save();
      }
    });
};


