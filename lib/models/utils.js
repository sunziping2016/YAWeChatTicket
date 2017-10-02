const request = require('request');
const path = require('path');
const fs = require('fs');

function randomAlnumString(length) {
  const chars = '0123456789' +
    'abcdefghijklmnopqrstuvwxyz' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; ++i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

async function fetchFile(url, destination) {
  if (destination === undefined)
    destination = randomAlnumString(100);
  return new Promise(function (resolve, reject) {
    request.get(url)
      .pipe(fs.createWriteStream(path.join('uploads', destination)))
      .on('error', reject)
      .on('finish', function () {
        resolve(destination);
      });
  });
}

function redisfy(object) {
  let result = [];
  for (let key in object) {
    if (!object.hasOwnProperty(key))
      continue;
    result.push(key);
    result.push(object[key]);
  }
  return result;
}

module.exports = {
  randomAlnumString,
  fetchFile,
  redisfy
};
