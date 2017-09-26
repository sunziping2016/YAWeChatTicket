const {Handler} = require('./handler');

class HelpHandler extends Handler {
  constructor(site, name) {
    super(name);
    this.site = site;
  }

  handle(msg, ctx) {
    if (msg.MsgType === 'text' &&
        (msg.Content === '帮助' || msg.Content.toLowerCase() === 'help'))
      return [{
        title: '紫荆之声-操作指南',
        description: '刚刚关注平台不知道该做什么？抢票时间将近却不知从何入手？' +
                     '点这里，三步内带你抢票，分秒间玩转紫荆之声！',
        picurl: this.site + '/static/img/icons/android-chrome-192x192.png',
        url: this.site + '/help'
      }];
  }
}

module.exports = {
  HelpHandler
};
