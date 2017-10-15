require('winston').level = 'error';
const config = require('../config.test.json');
const server = new (require('../lib/server'))(config);
const data = require('./ticket-data.json');
const assert = require("assert");

describe('Ticket module test', function() {
  let request, ctx, token;

  before(async function () {
    await server.start();
    ctx = server.app.context;
    const {users, activities, tickets} = ctx.models;
    await users.remove();
    await users.create(data.users);
    await tickets.remove();
    await tickets.create(data.tickets);
    await activities.remove();
    await activities.create(data.activities);
    request = require('supertest').agent(server.server);
    await request
      .post('/api/auth')
      .send({strategy: 'local',
        payload: {username: 'hello', password: 'world'}})
      .expect('Content-Type', /json/)
      .expect(200)
      .then(response => {
        token = response.body.data.token;
      });
  });

  after(function (done) {
    server.stop().then(done);
  });

  describe('fetch an activity', function () {
    it('should return activity when everything is okay', function () {
      return request
        .get('/api/activity/' + '59e21155750b9b5d0cb2b8e7')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          assert.strictEqual(response.body.data._id,
            '59e21155750b9b5d0cb2b8e7');
        });
    });

    it('should return 401 when activity is not published', function () {
      return request
        .get('/api/activity/' + '59e21155750b9b5d0cb2b8e8')
        .expect('Content-Type', /json/)
        .expect(401);
    });

    it('should be okay when activity is not published but owned by user', function () {
      return request
        .get('/api/activity/' + '59e21155750b9b5d0cb2b8e9')
        .set('Authorization', 'Bearer ' + token)
        .expect('Content-Type', /json/)
        .expect(200);
    });
  });

  describe('create an ticket', function () {
    it('should return activity when everything is okay', function () {
      return request
        .get('/api/activity/' + '59e21155750b9b5d0cb2b8e7')
        .expect('Content-Type', /json/)
        .expect(200)
        .then(response => {
          assert.strictEqual(response.body.data._id,
            '59e21155750b9b5d0cb2b8e7');
        });
    });
  });
});
