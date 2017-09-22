const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  openId: { type: String, index: true, required: true },
  studentId: { type: String, index: true }
});

module.exports = function (config) {
  return db.model('user', userSchema);
};
