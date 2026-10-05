// The cross-cutting error behaviour: unknown routes, content negotiation,
// bad bodies and unexpected errors all follow the one error contract.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const app = require('./helpers/app');
const assertError = require('./helpers/assert-error');
const errorHandler = require('../src/middleware/error-handler');

test('an unknown route returns 404', async () => {
  const res = await request(app).get('/api/v1/no-such-thing');
  assertError(res, 404, 'NOT_FOUND');
});

test('an Accept header that excludes JSON returns 406', async () => {
  const res = await request(app).get('/api/v1/health').set('Accept', 'text/html');
  assertError(res, 406, 'NOT_ACCEPTABLE');
});

test('an Accept header that allows JSON is fine', async () => {
  const res = await request(app).get('/api/v1/health').set('Accept', 'text/html, */*;q=0.1');
  assert.equal(res.status, 200);
});

test('a POST body that is not JSON returns 415', async () => {
  const res = await request(app)
    .post('/api/v1/health')
    .set('Content-Type', 'text/plain')
    .send('hello');
  assertError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
});

test('a POST body with no Content-Type returns 415', async () => {
  const res = await request(app).post('/api/v1/health').send(Buffer.from('{"a":1}'));
  assertError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
});

test('malformed JSON returns 400', async () => {
  const res = await request(app)
    .post('/api/v1/health')
    .set('Content-Type', 'application/json')
    .send('{"not valid json');
  assertError(res, 400, 'BAD_REQUEST');
});

test('a body over the size limit returns 413', async () => {
  const res = await request(app)
    .post('/api/v1/health')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ padding: 'x'.repeat(200 * 1024) }));
  assertError(res, 413, 'PAYLOAD_TOO_LARGE');
});

test('an unexpected error returns 500 without leaking details', async (t) => {
  // A throwaway app with a failing route, using the real error handler.
  const failing = express();
  failing.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  failing.use(errorHandler);
  t.mock.method(console, 'error', () => {}); // the handler logs the stack; keep test output clean

  const res = await request(failing).get('/boom');

  assertError(res, 500, 'INTERNAL_ERROR');
  assert.doesNotMatch(res.text, /hunter2|at .*\.js/);
});
