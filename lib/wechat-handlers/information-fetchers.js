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

function wechatInfoMap(info) {
  let result = {};
  result.wechatInfoUpdateAt = new Date();
  result.openId = info.openid;
  result.unionId = info.unionid;
  result.wechatSubscribe = info.subscribe === 1;
  if (result.wechatSubscribe) {
    result.wechatNickname = info.nickname;
    result.wechatGender = info.sex;
    result.wechatAvatar = info.headimgurl;
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
  async handle(msg, ctx) {
    const users = ctx.models.users,
      wechat = ctx.models.wechat,
      openId = msg.FromUserName;
    if (typeof openId === 'string') {
      let document = await users.findOne({openId});
      if (document === null)
        document = new users({openId});
      console.log(document);
    }
  }
}

async function fetchAllUsersInfo (app) {
  const users = app.context.models.users,
    wechat = app.context.models.wechat;
  let result = await wechat.getFollowers();
  let followers = new Set(result.data.openid), nextOpenid = result.next_openid;
  while (nextOpenid !== '') {
    result = await wechat.getFollowers(nextOpenid);
    if (result.data !== undefined)
      for (let id of result.data.openid)
        followers.add(id);
    nextOpenid = result.next_openid;
  }
  followers = Array.from(followers);
  let splittedFollowers = [];
  for (let i = 0; i < followers.length; i += 100)
    splittedFollowers.push(followers.slice(i, i + 100));
  await Promise.all(splittedFollowers.map(async function (openids) {
    let result = (await wechat.batchGetUsers(openids)).user_info_list;
    result = Array.from(await Promise.all(result.map(async function (info) {
      info = wechatInfoMap(info);
      if (info.wechatAvatar !== undefined)
        info.wechatAvatar = await fetchAvatar(info.wechatAvatar);
      return info;
    })));
    await users.insertMany(result);
  }));
}

module.exports = {
  fetchAllUsersInfo,
  UserInfoFetcher
};
