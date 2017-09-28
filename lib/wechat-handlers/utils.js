async function getFollowers(wechat) {
  let result = await wechat.getFollowers();
  if (result.data === undefined)
    return new Set();
  let followers = result.data.openid;
  while (followers.size < result.total && result.next_openid !== '') {
    result = await wechat.getFollowers(result.next_openid);
    if (result.data !== undefined)
      followers = followers.concat(result.data.openid);
  }
  return followers;
}

async function batchGetUsers(wechat, followers) {
  let splittedFollowers = [], results = [];
  for (let i = 0; i < followers.length; i += 100)
    splittedFollowers.push(followers.slice(i, i + 100));
  await Promise.all(splittedFollowers.map(function (openids) {
    return wechat.batchGetUsers(openids).then(function (data) {
      results = results.concat(data.user_info_list);
    });
  }));
  return results;
}

module.exports = {
  getFollowers,
  batchGetUsers
};
