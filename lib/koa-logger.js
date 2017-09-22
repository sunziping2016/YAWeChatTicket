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
 * @param {winston} winston - A winston logger instance.
 * @returns {function} Middleware for koa.
 */
function logger(winston) {
  return async (ctx, next) => {
    const start = new Date();
    await next();
    const duration = new Date() - start;

    let logLevel;
    if (ctx.status >= 500)
      logLevel = 'error';
    else if (ctx.status >= 400)
      logLevel = 'warn';
    else
      logLevel = 'info';

    const msg = (
      chalk.gray(`${ctx.method} ${ctx.originalUrl}`) +
      chalk[STATUS_COLORS[logLevel]](` ${ctx.status} `) +
      chalk.gray(`${duration}ms`)
    );

    winston.log(logLevel, msg);
  };
}

module.exports = logger;
