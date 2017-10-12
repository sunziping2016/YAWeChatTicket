const url = require(__dirname + '/config.json').redis;
const redis = require('redis').createClient({url});
const io = require('socket.io-emitter')(redis);
io.emit(...process.argv.slice(2));
redis.quit();
