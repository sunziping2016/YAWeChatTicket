const {Handler} = require('./handler');

class RegisterHandler extends Handler {
  handle(msg, ctx) {
    if (msg.MsgType === 'text' &&
      (msg.Content === '注册' || msg.Content.toLowerCase() === 'register')) {
      const site = ctx.config.site;
      const url = ctx.models.wechatOAuth.getOAuth()
        .getAuthorizeURL(`${site}/api/auth/wechat?to=${encodeURIComponent('/register')}`);
      return `点击<a href="${url}">此处</a>注册账号`;
    }
  }
}

class PersonalCenterHandler extends Handler {
  handle(msg, ctx) {
    if (msg.MsgType === 'text' &&
      (msg.Content === '个人中心' || msg.Content.toLowerCase() === 'account')) {
      const site = ctx.config.site;
      const url = ctx.models.wechatOAuth.getOAuth()
        .getAuthorizeURL(`${site}/api/auth/wechat?to=${encodeURIComponent('/account')}`);
      return `点击<a href="${url}">此处</a>打开个人中心`;
    }
  }
}

class HelpHandler extends Handler {
  handle(msg, ctx) {
    if (msg.MsgType === 'text' &&
        (msg.Content === '帮助' || msg.Content.toLowerCase() === 'help')) {
      const site = ctx.config.site;
      return [{
        title: '紫荆之声-操作指南',
        description: '刚刚关注平台不知道该做什么？抢票时间将近却不知从何入手？' +
        '点这里，三步内带你抢票，分秒间玩转紫荆之声！',
        picurl: site + '/static/img/icons/android-chrome-192x192.png',
        url: site + '/help'
      }];
    }
  }
}

module.exports = {
  RegisterHandler,
  PersonalCenterHandler,
  HelpHandler
};
