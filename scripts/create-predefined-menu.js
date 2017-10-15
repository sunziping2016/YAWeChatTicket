const argv = require('minimist')(process.argv.slice(2));
const config = require(argv.test ? '../config.test.json' : '../config.json');
const redis = require('redis').createClient({url: config.redis});
const global = require('../lib/models/global');

(async function () {
  const model = await global(redis, config);
  let predefinedWechatMenu = require('./predefined-menu')(config);
  await model.getWechat().createMenu(predefinedWechatMenu);
  await model.setWechatMenu(predefinedWechatMenu);
  redis.quit();
})();
