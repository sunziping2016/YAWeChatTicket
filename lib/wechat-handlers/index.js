const process = require('process');
const {ComposedHandler} = require('./handler');
const {FallbackHandler, ExceptionHandler} = require('./common-handlers');
const {HelpHandler} = require('./account-handlers');
const {fetchAllUsersInfo, UserInfoFetcher} =
  require('./information-fetchers');
const {MathHandler} = require('./math-handler');

module.exports = async function (app, config) {
  const logger = app.context.logger;
  const regularHandler = new ComposedHandler([
    new UserInfoFetcher('Information Fetcher'),
    new MathHandler('Math'),
    new HelpHandler(config.site, 'Help'),
    new FallbackHandler('Fallback')
  ], 'WeChat Handlers');
  const exceptionHandler = new ExceptionHandler('Exception Handler');

  if (process.env.WORKER_INDEX === '0') {
    fetchAllUsersInfo(app);
    // TODO: Add timer for information update
  }

  return async function (msg, ctx) {
    let result = null;
    try {
      result = await regularHandler.handle(msg, ctx);
    } catch (err) {
      logger.error(err);
      return await exceptionHandler.handle(msg, ctx);
    }
    return result === null ? '' : result;
  };
};
