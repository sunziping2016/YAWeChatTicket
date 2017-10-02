const logger = require('winston');
const {redisfy} = require('utils');

const prefix = 'sess:';

class RedisSession {
  constructor(client) {
    this.client = client;
  }
  save(sid, data, exp) {
    sid = prefix + sid;
    return new Promise((resolve, reject) => {
      function callback(err, res) {
        if (err)
          reject(err);
        else
          resolve(res);
      }
      if (exp === undefined)
        this.client.hmset(sid, redisfy(data), callback);
      else
        this.client.hmset(sid, redisfy(data), 'PX', exp, callback);
    })
  }
  load(sid) {
    return new Promise((resolve, reject) => {
      this.client.hgetall(prefix + sid, function callback(err, res) {
        if (err)
          reject(err);
        else {
          resolve(res);
        }
      });
    })
  }
}

module.exports = function (client) {
  return new RedisSession(client);
};

