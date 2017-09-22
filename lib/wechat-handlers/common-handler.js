/**
 * Some common handlers for WeChat.
 * @module wechat-handlers/common-handler
 */

const {Handler} = require('./handler');


/**
 * Fallback handler.
 */
class FallbackHandler extends Handler {
  async handle(msg, ctx) {
    return '对不起，没有合适的指令，请检查你的指令格式是否正确。';
  }
}

class ExceptionHandler extends Handler {
  async handle(msg, ctx) {
    return '服务器发生了内部错误 T T，请稍后再试。';
  }
}

module.exports = {
  FallbackHandler,
  ExceptionHandler
};
