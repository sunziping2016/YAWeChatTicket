(async function () {
  const assert = require("assert");
  const argv =  require('minimist')(process.argv.slice(2));
  const bcrypt = require('bcrypt');
  const config = require(argv.test ? '../config.test.json' : '../config.json');
  const mongoose = require('mongoose');
  mongoose.Promise = global.Promise;
  const db = await mongoose.createConnection(config.db, {useMongoClient: true});
  const users = require('../lib/models/users')(db);
  for (let user of require('./predefined-users.json')) {
    const username = user.username;
    assert(username);
    if (user.password)
      user.password = await bcrypt.hash(user.password, 10);
    else
      user.password = null;
    if (!user.roles)
      user.roles = [];
    await users.findOneAndUpdate({
      username: username
    }, {
      $setOnInsert: user
    }, {
      upsert: true
    });
  }
  await db.close();
})();
