const path = require('path');
const fs = require('fs');
const logger = require('winston');
const {Handler} = require('./handler');

class UserInfoFetcher extends Handler {
  handle(msg, ctx) {
    const users = ctx.models.wechatUsers,
      wechat = ctx.models.wechat,
      openId = msg.FromUserName;
    (async () => {
      if (msg.Event === 'subscribe' || msg.Event === 'unsubscribe') {
        let [document, info] = await Promise.all([
          users.findOne({openId}),
          wechat.getUser(openId)
        ]);
        if (document === null)
          document = new users({openId});
        await document.fromInfo(info);
        await document.save();
        logger.info(`Update user's WeChat record: ${openId}`)
      }
    })().catch(function (err) {
      logger.error(`Failed to update user's info for ${msg.Event} event (non-fatal)`);
      logger.error(err);
    });
  }
}

function fetchAllUsersInfo (app) {
  const users = app.context.models.wechatUsers,
    wechat = app.context.models.wechat;
  (async () => {
    let [followers, allUsers] = await Promise.all([
      wechat.getFollowers(),
      await users.find({}, {openId: 1, subscribe: 1})
    ]);
    followers = new Set(followers);
    for (let user of allUsers) {
      const openId = user.openId;
      if (openId !== undefined) {
        if ((user.subscribe === true && !followers.has(openId)) ||
            (user.subscribe === false && followers.has(openId)))
          followers.add(openId);
        else if (user.subscribe !== undefined)
          followers.delete(openId)
      }
    }
    if (followers.size === 0)
      return;
    followers = Array.from(followers);
    await users.insertMany(await Promise.all(
      (await wechat.batchGetUsers(followers))
      .map(function (info) {
        return users.mapInfo(info)
      }))
    );
  })().catch(function(err) {
    logger.error('Failed to update unrecorded but subscribed users\' info (non-fatal)');
    logger.error(err);
  })
}

module.exports = {
  fetchAllUsersInfo,
  UserInfoFetcher
};
