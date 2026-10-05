const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const assertError = require('./helpers/assert-error');
const { version } = require('../package.json');

test('GET /api/v1/health returns status, version, data source and record counts', async () => {
  const res = await request(app).get('/api/v1/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    status: 'ok',
    version,
    data_source: 'memory',
    record_counts: {
      provinces: 9,
      districts: 25,
      substations: 30,
      installations: 200,
      readings: 131027,
      users: 37,
    },
  });
});

test('every response carries an X-Request-Id and no automatic ETag', async () => {
  const res = await request(app).get('/api/v1/health');

  assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  assert.equal(res.headers.etag, undefined);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('a safe incoming X-Request-Id is reused, an unsafe one is replaced', async () => {
  const safe = await request(app).get('/api/v1/health').set('X-Request-Id', 'gateway-123');
  assert.equal(safe.headers['x-request-id'], 'gateway-123');

  const unsafe = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id\twith tab');
  assert.notEqual(unsafe.headers['x-request-id'], 'bad id\twith tab');
});

test('POST /api/v1/health returns 405 with an Allow header', async () => {
  const res = await request(app).post('/api/v1/health');

  assertError(res, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(res.headers.allow, 'GET, HEAD');
});
