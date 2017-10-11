const global = require('./global');
const users = require('./users');
const wechatUsers = require('./wechat-users');
const activities = require('./activities');
const session = require('./session');
const wechatOAuth = require('./wechat-oauth');

module.exports = async function (db, redis, sio, config) {
  return {
    global: await global(redis, config),
    users: users(db, sio),
    wechatUsers: wechatUsers(db, sio),
    activities: activities(db, sio),
    session: session(redis),
    wechatOAuth: wechatOAuth(redis, config)
  };
};
