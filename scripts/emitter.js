const argv = require('minimist')(process.argv.slice(2));
const config = require(argv.test ? '../config.test.json' : '../config.json');
const redis = require('redis').createClient({url: config.redis});
const io = require('socket.io-emitter')(redis);
io.emit(...argv._);
redis.quit();
