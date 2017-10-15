const {Handler} = require('./handler');
const createTicket = require('../base-apis/tickets').create;

const buyTicketRegex = /^抢票\s+(.+)$/, oneDay = 86400 * 1000,
  buyTicketEventKey = /^BUY_TICKET_(\d+)$/,
  deleteTicketRegex = /^退票\s+(.+)$/;

class FindActivity extends Handler {
  async handle(msg, ctx) {
    if (msg.MsgType === 'event' && msg.EventKey === 'FIND_ACTIVITY' ||
      msg.MsgType === 'text' && msg.Content === '抢啥') {
      const {activities} = ctx.models;
      let available = await activities.find({
        bookBeginTime: {$lte: new Date(Date.now() + oneDay * 3)},
        bookEndTime: {$gt: new Date()},
        remainTickets: {$gt: 0},
        published: true
      }).notDeleted()
        .sort({beginTime: -1, _id: -1})
        .limit(3);
      if (available.length === 0)
        return `似乎最近没有什么活动。你可以点击<a href="${ctx.config.site + '/#/'}">此处</a>查看历史活动。`;
      else
        return available.map(x => {
          return {
            title: x.name,
            description: x.excerption,
            picurl: ctx.config.site + '/uploads/' + x.mainImageThumbnail,
            url: ctx.config.site + '/#/activity/' + x._id
          }
        });
    }
  }
}

class BuyTicket extends Handler {
  async handle(msg, ctx) {
    let match, activity;
    const {global, activities, wechatUsers, tickets} = ctx.models;
    if (msg.MsgType === 'text' && (match = msg.Content.match(buyTicketRegex)))
      activity = match[1];
    else if (msg.MsgType === 'event' &&
      (match = msg.EventKey.match(buyTicketEventKey))) {
      let wechatMenu = await global.getWechatMenu();
      if (wechatMenu && wechatMenu.button) {
        wechatMenu = wechatMenu.button[1];
        if (wechatMenu && wechatMenu.sub_button)
          activity = wechatMenu.sub_button[parseInt(match[1])].name;
      }
    }
    if (activity) {
      let wechatUser = await wechatUsers.findById(msg.FromUserName);
      if (!wechatUser.userId)
        return '请先注册或登录后再进行抢票。';
      let available = await activities.findOne({
        bookBeginTime: {$lte: new Date(Date.now() + oneDay * 3)},
        bookEndTime: {$gt: new Date()},
        shortName: activity,
        remainTickets: {$gt: 0},
        published: true
      }).notDeleted();
      if (!available)
        return '找不到指定的活动。';
      try {
        const result = await createTicket({activity: String(available._id)}, {
          tickets,
          activities,
          io: ctx.io,
          uid: wechatUser.userId
        });
        return [{
          title: available.name + ' - 电子票',
          description: available.excerption,
          picurl: ctx.config.site + '/uploads/' + available.mainImageThumbnail,
          url: ctx.config.site + '/#/ticket/' + result.data._id
        }]
      } catch (err) {
        switch (err.message) {
          case 'One user can only have one ticket':
            return '您已经抢过这个该活动的票。';
          case 'Invalid activity':
            return '活动未开放或已无余票。';
        }
      }
    }
  }
}

class DeleteTicket extends Handler {
  async handle(msg, ctx) {
    let match, activity;
    const {global, activities, wechatUsers, tickets} = ctx.models;
    if (msg.MsgType === 'text' && (match = msg.Content.match(deleteTicketRegex)))
      activity = match[1];
    if (activity) {
      let wechatUser = await wechatUsers.findById(msg.FromUserName);
      if (!wechatUser.userId)
        return '请先注册或登录并绑定微信。';
      let available = await activities.findOne({
        bookBeginTime: {$lte: new Date(Date.now() + oneDay * 3)},
        bookEndTime: {$gt: new Date()},
        shortName: activity,
        published: true
      }).notDeleted();
      if (!available)
        return '找不到相应的活动。';
      const ticket = await tickets.findOne({
        owner: wechatUser.userId,
        activity: available._id,
      }).notDeleted();
      if (!ticket)
        return '您并未持有该活动的票。';
      if (ticket.status === 1) {
        await activities.findOneAndUpdate({
          _id: available._id
        }, {
          $inc: {remainTickets: 1}
        });
      }
      await ticket.delete();
      return '退票成功。'
    }
  }
}

class FindTicket extends Handler {
  async handle(msg, ctx) {
    let match, activity;
    const {global, activities, wechatUsers, tickets} = ctx.models;
    if (msg.MsgType === 'event' && msg.EventKey === 'FIND_TICKET' ||
      msg.MsgType === 'text' && msg.Content === '查票') {
      let wechatUser = await wechatUsers.findById(msg.FromUserName);
      if (!wechatUser.userId)
        return '请先注册或登录并绑定微信。';
      let available = await tickets.find({
        owner: wechatUser.userId
      }).notDeleted()
        .sort({_id: -1})
        .limit(3);
      if (available.length === 0)
        return '你还未曾进行抢票';
      let results = [];
      for (let x of available) {
        const activity = await activities.findById(x.activity);
        if (activity)
        results.push({
          title: activity.name + ' - 电子票',
          description: activity.excerption,
          picurl: ctx.config.site + '/uploads/' + activity.mainImageThumbnail,
          url: ctx.config.site + '/#/ticket/' + x._id
        });
      }
      return results;
    }
  }
}

module.exports = {
  FindActivity,
  BuyTicket,
  DeleteTicket,
  FindTicket
};

