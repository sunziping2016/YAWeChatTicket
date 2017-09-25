const {ComposedHandler} = require('./handler');
const {FallbackHandler, ExceptionHandler} = require('./common-handler');

const handler = new ComposedHandler([
  //new FallbackHandler('Fallback')
], 'WeChat Handlers');

const exceptionHandler = new ExceptionHandler('Exception Handler');

module.exports = async function (msg, ctx) {
  let result = null;
  try {
    console.log(msg);
    result = await handler.handle(msg, ctx);
  } catch (err) {
    return await exceptionHandler.handle(msg, ctx);
  }
  return result === null ? '' : result;
};
