const WechatAPI = require('co-wechat-api');
const crypto = require('crypto');
const process = require('process');

const prefix = 'global:';
const cacheDuration = 3600 * 1000;

class RedisGlobal {
  constructor(client, config) {
    this.client = client;
    this.wechat = new WechatAPI(
      config.wechat.appid,
      config.wechat.appsecret,
      this.getWechatToken.bind(this),
      this.setWechatToken.bind(this)
    );

    this.secretKey = null;
    this.secretKeyExpiresAt = null;

  }
  getWechat() {
    return this.wechat;
  }
  setWechatToken(token) {
    return new Promise((resolve, reject) => {
      this.client.hmset(prefix + 'wechat', [
          'accessToken', token.accessToken,
          'expireTime', token.expireTime
        ],
        function (err, res) {
          if (err)
            reject(err);
          else
            resolve(res);
        }
      );
    });
  }
  getWechatToken() {
    return new Promise((resolve, reject) => {
      this.client.hgetall(prefix + 'wechat', function (err, res) {
        if (err)
          reject(err);
        else {
          if (res && res.expireTime)
            res.expireTime = parseInt(res.expireTime);
          resolve(res);
        }
      });
    });
  }
  getSecretKey() {
    if (this.secretKey && Date.now() < this.secretKeyExpiresAt)
      return this.secretKey;
    return new Promise((resolve, reject) => {
      this.client.get(prefix + 'secretKey', (err, res) => {
        if (err)
          reject(err);
        else {
          if (res) {
            this.secretKey = Buffer.from(res);
            this.secretKeyExpiresAt = Date.now() + cacheDuration;
          } else
            this.secretKey = null;
          resolve(this.secretKey);
        }
      });
    });
  }
  setSecretKey(secretKey) {
    this.secretKey = secretKey;
    this.secretKeyExpiresAt = Date.now() + cacheDuration;
    return new Promise((resolve, reject) => {
      this.client.set(prefix + 'secretKey', this.secretKey, function (err, res) {
        if (err)
          reject(err);
        else
          resolve(res);
      });
    });
  }
}

module.exports = async function (client, config) {
  const model = new RedisGlobal(client, config);
  if (process.env.WORKER_INDEX === '0') {
    let secretKey = await model.getSecretKey();
    if (!secretKey) {
      secretKey = await new Promise(function (resolve, reject) {
        crypto.randomBytes(256, function(err, buf) {
          if (err)
            reject(err);
          else
            resolve(buf);
        });
      });
      await model.setSecretKey(secretKey);
    }
  }
  return model;
};
