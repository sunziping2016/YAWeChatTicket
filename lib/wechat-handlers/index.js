const {ComposedHandler} = require('./handler');
const {FallbackHandler, ExceptionHandler} = require('./common-handlers');
const {HelpHandler} = require('./account-handlers');
const {fetchAllUsersInfo, UserInfoFetcher} =
  require('./information-fetchers');

module.exports = async function (app, config) {
  const regularHandler = new ComposedHandler([
    new UserInfoFetcher('Information Fetcher'),
    new HelpHandler(config.site, 'Help'),
    new FallbackHandler('Fallback')
  ], 'WeChat Handlers');

  const exceptionHandler = new ExceptionHandler('Exception Handler');

  //await fetchAllUsersInfo(app);

  return async function (msg, ctx) {
    let result = null;
    try {
      console.log(msg);
      result = await regularHandler.handle(msg, ctx);
    } catch (err) {
      return await exceptionHandler.handle(msg, ctx);
    }
    return result === null ? '' : result;
  };
};
