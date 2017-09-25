function evaluateRewriteRule(ctx, match, rule) {
  if (typeof rule === 'string')
    return rule;
  else
    return rule({
      parsedUrl: ctx,
      match: match
    });
}

function historyFallback(options) {
  options = options || {};

  return function(ctx, next) {
    const headers = ctx.headers;

    if (ctx.method !== 'GET' || !ctx.accepts('html'))
      return next();

    options.rewrites = options.rewrites || [];
    for (let rewrite of options.rewrites) {
      const match = ctx.path.match(rewrite.from);
      if (match !== null) {
        req.url = evaluateRewriteRule(ctx, match, rewrite.to);
        return next();
      }
    }

    if (ctx.path.indexOf('.') !== -1 && options.disableDotRule !== true)
      return next();

    ctx.url = options.index || '/index.html';
    return next()
  };
}

module.exports = historyFallback;
