/**
 * Logger for koa profiling.
 * @module koa-logger
 */

const chalk = require('chalk');
const STATUS_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green'
};


/**
 * A middleware for profiling koa
 * @param {object} winston - A winston logger instance.
 * @returns {function} Middleware for koa.
 */
function logger(winston) {
  return async (ctx, next) => {
    const start = new Date();
    let status;
    try {
      await next();
      status = ctx.status;
    } catch (err) {
      status = err.status || 500;
      throw err;
    } finally {
      const duration = new Date() - start;
      let logLevel;
      if (status >= 500)
        logLevel = 'error';
      else if (status >= 400)
        logLevel = 'warn';
      else
        logLevel = 'info';

      const msg = (
        chalk.gray(`${ctx.method} ${ctx.originalUrl}`) +
        chalk[STATUS_COLORS[logLevel]](` ${status} `) +
        chalk.gray(`${duration}ms`)
      );

      winston.log(logLevel, msg);
    }
  };
}

module.exports = logger;
