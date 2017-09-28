const ajv = new (require('ajv'))();

function validate(ctx, schema, data) {
  ctx.assert(schema(data), 400, JSON.stringify({
    code: 400,
    type: 'ESCHEMA',
    message: ajv.errorsText(schema.errors),
    data: schema.errors
  }));
}

module.exports = {
  validate
};
