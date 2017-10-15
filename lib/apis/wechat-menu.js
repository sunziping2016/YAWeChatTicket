const ajv = new (require('ajv'))();
const {httpValidate, httpAssert, getAuthorization} = require('./utils');

const oneDay = 86400 * 1000;

async function getWechatMenuAndRecentActivities(ctx) {
  const token = await getAuthorization(ctx),
    {global, activities} = ctx.models;
  httpAssert(token && token.role && token.role & 0b100, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  let wechatMenu = await global.getWechatMenu(), menu = [];
  if (wechatMenu && wechatMenu.button) {
    wechatMenu = wechatMenu.button[1];
    if (wechatMenu && wechatMenu.sub_button)
      menu = wechatMenu.sub_button.filter(x => {
        return x.type === 'click' && x.key.startsWith('BUY_TICKET');
      }).map(x => x.name);
  }
  let available = await activities.find({
    bookBeginTime: {$lte: new Date(Date.now() + oneDay * 3)},
    bookEndTime: {$gt: new Date()},
    remainTickets: {$gt: 0},
    published: true
  }).sort({beginTime: -1, _id: -1})
    .limit(50)
    .notDeleted().select('shortName');
  available = available.filter(x => !!x.shortName).map(x => x.shortName);
  ctx.body = {
    code: 200,
    type: 'OK',
    data: {
      menu,
      available
    }
  };
}

const setWechatMenuSchema = ajv.compile({
  type: 'array',
  items: {type: 'string'},
  maxItems: 5
});

async function setWechatMenu(ctx) {
  const body = ctx.request.body,
    {global} = ctx.models,
    token = await getAuthorization(ctx);
  httpValidate(setWechatMenuSchema, body);
  httpAssert(token && token.role && token.role & 0b100, 401, {
    type: 'EAUTH',
    message: 'Authentication failed'
  });
  let wechatMenu = await global.getWechatMenu();
  wechatMenu = wechatMenu || {};
  wechatMenu.button = wechatMenu.button || [];
  httpAssert(wechatMenu.button.length >= 2, 400, {
    type: 'ESCHEMA',
    message: 'Unknown menu'
  });
  if (body.length === 0) {
    wechatMenu.button[1] = {
      type: 'click',
      name: '抢票',
      key: 'BUY_TICKET'
    }
  } else {
    wechatMenu.button[1] = {
      name: '抢票',
      sub_button: body.map((x, i) => {
        return {
          type: 'click',
          name: x,
          key: 'BUY_TICKET_' + i,
        };
      })
    };
  }
  await global.getWechat().createMenu(wechatMenu);
  await global.setWechatMenu(wechatMenu);
  ctx.body = {
    code: 200,
    type: 'OK'
  };
}

module.exports = {
  getWechatMenuAndRecentActivities,
  setWechatMenu
};
