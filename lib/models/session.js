const {redisfy, randomAlnumString} = require('./utils');

const prefix = 'sess:';

class RedisSession {
  constructor(client) {
    this.client = client;
  }
  save(sid, data, exp) {
    sid = prefix + sid;
    return new Promise((resolve, reject) => {
      this.client.hmset(sid, redisfy(data), (err, res) => {
        if (err)
          reject(err);
        else if (exp)
          this.client.expire(sid, exp, (err, res) => {
            if (err)
              reject(err);
            else
              resolve(res);
          });
        else
          resolve(res);
      });
    });
  }
  static genToken() {
    return randomAlnumString(40);
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

