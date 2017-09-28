const global = require('./global');
const users = require('./users');
const wechatUsers = require('./wechat-users');

module.exports = async function (config) {
  return {
    global: await global(config),
    users: users(),
    wechatUsers: wechatUsers()
  };
};
