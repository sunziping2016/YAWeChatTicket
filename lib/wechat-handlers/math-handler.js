const {Handler} = require('./handler');

class MathHandler extends Handler {
  handle(msg, ctx) {
    if (msg.MsgType === 'text' && /^[-+0-9*/.() ]+$/.test(msg.Content)) {
      try {
        return String(eval(msg.Content));
      } catch (err) {
        return '非法的表达式'
      }
    }
  }
}

module.exports = {
  MathHandler
};
