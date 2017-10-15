require('winston').level = 'error';
const config = require('../config.test.json');
const server = new (require('../lib/server'))(config);

describe('A hello world test', function() {
  let request;

  before(function (done) {
    server.start().then(() => {
      request = require('supertest').agent(server.server);
      done();
    });
  });

  after(function (done) {
    server.stop().then(done);
  });

  describe('when GET /', function () {
    it('should return a home page', function(done) {
      request
        .get('/')
        .expect('Content-Type', /html/)
        .expect(200, done);
    });
  });
});
