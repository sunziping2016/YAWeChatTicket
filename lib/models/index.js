const users = require('./users');
const global = require('./global');
const wechat = require('./wechat');


module.exports = async function (config) {
  const globalModel = await global(config);

  return {
    global: globalModel,
    users: await users(),
    wechat: await wechat(globalModel, config)
  };
};
