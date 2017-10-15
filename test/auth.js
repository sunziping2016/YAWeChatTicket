require('winston').level = 'error';
const bcrypt = require('bcrypt');
const config = require('../config.test.json');
const server = new (require('../lib/server'))(config);
const data = require('./auth-data.json');
const assert = require("assert");

describe('Auth module test', function() {
  let request, ctx;

  before(async function () {
    for (let user of data.users) {
      user.secureUpdatedAt = new Date();
      if (user.password)
        user.password = await bcrypt.hash(user.password, 10);
    }
    await server.start();
    ctx = server.app.context;
    const {users, global} = ctx.models;
    await users.remove();
    await users.create(data.users);
    request = require('supertest').agent(server.server);
  });

  after(function (done) {
    server.stop().then(done);
  });

  describe('auth with username and password', function () {
    it('should return a valid token when everything is right', async function() {
      const req = data.tests[0].request;
      return request
        .post('/api/auth')
        .send(req)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          assert(response.body.data.token);
          assert.strictEqual(response.body.data.user.username,
            req.payload.username);
        });
    });

    it('should return a 401 when password is wrong', async function() {
      return request
        .post('/api/auth')
        .send(data.tests[1].request)
        .expect('Content-Type', /json/)
        .expect(401)
        .then(res => assert.strictEqual(res.body.message, 'Wrong password'));
    });

    it('should return a 401 when username is wrong', async function() {
      return request
        .post('/api/auth')
        .send(data.tests[2].request)
        .expect('Content-Type', /json/)
        .expect(401)
        .then(res => assert.strictEqual(res.body.message, 'User does not exist'));
    });
  });

  describe('auth with an old jwt', function () {
    const originReq = data.tests[0].request;
    let token;
    before(async function() {
      return request
        .post('/api/auth')
        .send(originReq)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          token = response.body.data.token;
        });
    });

    it('should return a new token when everything is right', async function() {
      const req = {
        strategy: 'jwt',
        payload: token
      };
      return request
        .post('/api/auth')
        .send(req)
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          assert(response.body.data.token);
          assert.strictEqual(response.body.data.user.username,
            originReq.payload.username);
        });
    });

    it('should return 401 when token is wrong', async function() {
      const req = {
        strategy: 'jwt',
        payload: token + 'a'
      };
      return request
        .post('/api/auth')
        .send(req)
        .expect('Content-Type', /json/)
        .expect(401);
    });
  });
});
