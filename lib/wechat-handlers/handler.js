/**
 * This module contains an abstract WeChat handler base-class, and a composed
 * WeChat handler.
 *
 * @module wechat-handlers/handler
 */


/**
 * The base abstract handler for WeChat message.
 */
class Handler {
  /**
   * Construct a base handler.
   *
   * @param {string} name - A name for this handler. Needs to be unique.
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Try to consume the message.
   *
   * See callback function of {@link https://github.com/node-webot/co-wechat|
   * `co-wechat`'s `middleware` method} for precise parameters and return type
   * definition.
   *
   * @param {object} msg - WeChat XML message
   * @param {object} ctx - Koa context
   * @returns {Promise} `null` if this handler cannot handle this msg.
   * Otherwise, the returned data will be used as a reply.
   */
  async handle(msg, ctx) {
    throw new Error('Needs to be implemented by derived classes.')
  }
}

/**
 * A composed WeChat handler. Tries each handler in turns.
 */
class ComposedHandler extends Handler {
  /**
   * Construct a composed handler consisting of some other handlers.
   *
   * @param {Array.<Handler>} handlers
   * @param {string} name
   */
  constructor(handlers, name) {
    super(name);
    this.handlers = handlers;
  }
  async handle(msg, ctx) {
    for (let handler of this.handlers) {
      let result = await handler.handle(msg, ctx);
      if (result !== null && result !== undefined)
        return result;
    }
    return null;
  }
}

module.exports = {
  Handler,
  ComposedHandler
};
