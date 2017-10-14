const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {addFileFields, addSocketHook, addUpdatedAt, addCreatedAt, addDeleted} =
  require('./utils');

module.exports = function (db, sio) {
  const userSchema = new Schema({
    // Does not mean Tsinghua's password
    username: {type: String, required: true},
    password: {type: String, default: null},
    studentId: {type: String},
    avatar: {type: String},
    avatarThumbnail: {type: String},
    realname: {type: String},
    department: {type: String},
    email: {type: String},
    createdAt: {type: Date},
    updatedAt: {type: Date},
    secureUpdatedAt: {type: Date, required: true},
    deleted: {type: Boolean, index: true},
    blocked: {type: Boolean},
    // User, Publisher, Administrator
    roles: {type: [{type: String, enum: [
      'user', 'publisher', 'administrator'
    ]}], default: [], index: true},

    wechatId: {type: String, ref: 'wechatUsers'}
  });

  userSchema.index({username: 1}, {
    unique: true,
    partialFilterExpression: {
      $and: [
        {username: {$exists: true}},
        {deleted: false}
      ]
    }
  });

  userSchema.index({studentId: 1}, {
    unique: true,
    partialFilterExpression: {
      $and: [
        {studentId: {$exists: true}},
        {deleted: false}
      ]
    }
  });

  addCreatedAt(userSchema);
  addCreatedAt(userSchema, 'secureUpdatedAt');
  addUpdatedAt(userSchema);
  addDeleted(userSchema);
  addFileFields(userSchema, ['avatar', 'avatarThumbnail']);
  if (sio)
    addSocketHook(userSchema, sio, 'users', function (doc) {
      return [
        'user:' + doc._id,
        'administrators'
      ];
    }, function (doc) {
      return doc.toPlainObject();
    });

  userSchema.virtual('hasPassword')
    .get(function() { return !!this.password; });

  userSchema.virtual('rolesMask')
    .get(function() {
      return this.constructor.rolesToMask(this.roles);
    });

  userSchema.methods.setPassword = async function (password) {
    if (password)
      this.password = await bcrypt.hash(password, 10);
    else
      this.password = null;
    this.secureUpdatedAt = new Date();
  };

  userSchema.methods.checkPassword = async function (password) {
    if (!this.password)
      return false;
    return await bcrypt.compare(password, this.password);
  };

  userSchema.methods.toPlainObject = function () {
    if (this.deleted)
      return {_id: this._id};
    return {
      _id: this._id,
      username: this.username,
      hasPassword: this.hasPassword,
      studentId: this.studentId,
      avatar: this.avatar ? '/uploads/' + this.avatar : undefined,
      avatarThumbnail: this.avatarThumbnail ? '/uploads/' +
        this.avatarThumbnail : undefined,
      realname: this.realname,
      department: this.department,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      secureUpdatedAt: this.secureUpdatedAt,
      blocked: this.blocked,
      roles: this.roles,
      wechatId: this.wechatId
    };
  };

  userSchema.statics.mapIdTsinghua = function (info) {
    if (info.ss === undefined || info.ss.account === undefined)
      return null;
    const account = info.ss.account;
    if (account.username === undefined || account.userId === undefined)
      return null;
    let result = {};
    if (account.username)
      result.username = account.username;
    if (account.userId)
      result.studentId = account.userId;
    if (account.realName)
      result.realname = account.realName;
    if (account.deptString)
      result.department = account.deptString;
    return result;
  };

  userSchema.statics.rolesToMask = function (roles) {
    const roleMap = {
      'user':          1 << 0,
      'publisher':     1 << 1,
      'administrator': 1 << 2
    };
    let mask = 0;
    for (let role of roles) {
      let m = roleMap[role];
      if (m)
        mask |= m;
    }
    return mask;
  };

  userSchema.statics.maskToRoles = function (mask) {
    const roles = [];
    if (mask & 1 << 0)
      roles.push('user');
    if (mask & 1 << 1)
      roles.push('publisher');
    if (mask & 1 << 2)
      roles.push('administrator');
    return roles;
  };

  return db.model('users', userSchema);
};
