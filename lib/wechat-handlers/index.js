const wechat = require('co-wechat');
const process = require('process');
const logger = require('winston');
const {ComposedHandler} = require('./handler');
const {FallbackHandler, ExceptionHandler} = require('./common-handlers');
const {RegisterHandler, HelpHandler} = require('./account-handlers');
const {fetchAllUsersInfo, UserInfoFetcher} = require('./info-fetchers');
const {MathHandler} = require('./math-handler');

module.exports = async function (app, config) {
  const regularHandler = new ComposedHandler([
    new UserInfoFetcher('Information Fetcher'),
    new MathHandler('Math'),
    new RegisterHandler('Register'),
    new HelpHandler('Help'),
    new FallbackHandler('Fallback')
  ], 'WeChat Handlers');
  const exceptionHandler = new ExceptionHandler('Exception Handler');

  if (process.env.WORKER_INDEX === '0') {
    //fetchAllUsersInfo(app);
    // TODO: Add timer for information update
  }

  return wechat(config.wechat).middleware(async function (msg, ctx) {
    let result = null;
    try {
      result = await regularHandler.handle(msg, ctx);
    } catch (err) {
      logger.error(err);
      return await exceptionHandler.handle(msg, ctx);
    }
    return result === null ? '' : result;
  });
};
