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

module.exports = {
  randomAlnumString,
  fetchFile
};
