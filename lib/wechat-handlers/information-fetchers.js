const path = require('path');
const fs = require('fs');
const request = require('request');
const {Handler} = require('./handler');

function randomAlnumString(length) {
  const chars = '0123456789' +
    'abcdefghijklmnopqrstuvwxyz' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; ++i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

async function wechatInfoMap(info, result) {
  if (result === undefined)
    result = {};
  result.wechatInfoUpdateAt = new Date();
  result.openId = info.openid;
  result.unionId = info.unionid;
  result.wechatSubscribe = info.subscribe === 1;
  if (result.wechatSubscribe) {
    result.wechatNickname = info.nickname;
    result.wechatGender = info.sex;
    result.wechatAvatar = await fetchAvatar(info.headimgurl);
  }
  return result;
}

async function fetchAvatar(url) {
  let destination = randomAlnumString(100);
  return new Promise(function (resolve, reject) {
    request.get(url)
      .pipe(fs.createWriteStream(path.join('uploads', destination)))
      .on('error', reject)
      .on('finish', function () {
        resolve(destination);
      });
  });
}

class UserInfoFetcher extends Handler {
  handle(msg, ctx) {
    const users = ctx.models.users,
      wechat = ctx.models.wechat,
      openId = msg.FromUserName,
      logger = ctx.logger;
    (async () => {
      if (msg.Event === 'subscribe' || msg.Event === 'unsubscribe') {
        let [document, info] = await Promise.all([
          users.findOne({openId}),
          wechat.getUser(openId)
        ]);
        if (document === null)
          document = new users({openId});
        await wechatInfoMap(info, document);
        await document.save();
        logger.info(`Update user's WeChat record: ${openId}`)
      }
    })().catch(function(err) {
      logger.error(`Failed to update user's info for ${msg.Event} event (non-fatal)`);
      logger.error(err);
    });
  }
}

function fetchAllUsersInfo (app) {
  const users = app.context.models.users,
    wechat = app.context.models.wechat,
    logger = app.context.logger;
  (async () => {
    let result = await wechat.getFollowers();
    if (result.next_openid === '')
      return;
    let followers = new Set(result.data.openid), nextOpenid = result.next_openid;
    while (nextOpenid !== '') {
      result = await wechat.getFollowers(nextOpenid);
      if (result.data !== undefined)
        for (let id of result.data.openid)
          followers.add(id);
      nextOpenid = result.next_openid;
    }
    for (let user of await users.find({}, {openId: 1}))
      if (user.openId !== undefined)
        followers.delete(user.openId);
    followers = Array.from(followers);
    let splittedFollowers = [];
    for (let i = 0; i < followers.length; i += 100)
      splittedFollowers.push(followers.slice(i, i + 100));
    await Promise.all(splittedFollowers.map(async function (openids) {
      let result = (await wechat.batchGetUsers(openids)).user_info_list;
      result = Array.from(await Promise.all(result.map(function (info) {
        return wechatInfoMap(info);
      })));
      await users.insertMany(result);
      logger.info(`Update users' WeChat records: ${openids.join(', ')}`);
    }));
  })().catch(function(err) {
    logger.error('Failed to update unrecorded but subscribed users\' info (non-fatal)');
    logger.error(err);
  })
}

module.exports = {
  fetchAllUsersInfo,
  UserInfoFetcher
};
