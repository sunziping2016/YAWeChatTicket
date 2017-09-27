const wechat = require('./wechat');
const users = require('./users');
const wechatUsers = require('./wechat-users');

module.exports = async function (config) {
  return {
    wechat: await wechat(config),
    users: users(),
    wechatUsers: wechatUsers()
  };
};
