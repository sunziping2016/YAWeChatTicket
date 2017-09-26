const users = require('./users');
const global = require('./global');
const wechat = require('./wechat');


module.exports = async function (app, config) {
  const globalModel = await global(config);

  return {
    global: globalModel,
    users: await users(app),
    wechat: await wechat(globalModel, config)
  };
};
