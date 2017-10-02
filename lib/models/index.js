const global = require('./global');
const users = require('./users');
const wechatUsers = require('./wechat-users');
const session = require('./session');
const wechatOAuth = require('./wechat-oauth');

module.exports = async function (redis, config) {
  return {
    global: await global(redis, config),
    users: users(),
    wechatUsers: wechatUsers(),
    session: session(redis),
    wechatOAuth: wechatOAuth(redis, config)
  };
};
