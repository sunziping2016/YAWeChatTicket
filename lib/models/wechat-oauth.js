const OAuth = require('co-wechat-oauth');
const {redisfy} = require('./utils');

const prefix = 'oauth:';

class RedisWechatOAuth {
  constructor(client, config) {
    this.client = client;
    this.oauth = new OAuth(
      config.wechat.appid,
      config.wechat.appsecret,
      this.getToken.bind(this),
      this.setToken.bind(this)
    );
  }
  getOAuth() {
    return this.oauth;
  }
  getToken(openid) {
    return new Promise((resolve, reject) => {
      this.client.hgetall(prefix + openid, function (err, res) {
        if (err)
          reject(err);
        else {
          if (res && res.create_at)
            res.create_at = parseInt(res.create_at);
          resolve(res);
        }
      });
    });
  }
  setToken(openid, token) {
    return new Promise((resolve, reject) => {
      this.client.hmset(prefix + openid, redisfy(token), function (err, res) {
        if (err)
          reject(err);
        else if (res)
          resolve(res);
      });
    });
  }
}

module.exports = function (client, config) {
  return new RedisWechatOAuth(client, config);
};


