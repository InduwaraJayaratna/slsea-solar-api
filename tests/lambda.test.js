// The Lambda entry point, called directly with API Gateway HTTP API (payload
// format 2.0) events, as AWS would call it. Uses the in-memory data source.
require('./helpers/test-env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../src/lambda');
const config = require('../src/config');
const db = require('../src/config/db');
const { bearer } = require('./helpers/auth');

// A minimal HTTP API v2 event, shaped like the ones API Gateway sends.
function httpApiEvent(method, rawPath, { query = '', headers = {}, body } = {}) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath,
    rawQueryString: query,
    headers: { host: 'example.execute-api.ap-south-1.amazonaws.com', ...headers },
    requestContext: {
      http: { method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '203.0.113.1' },
      requestId: 'test-request',
      stage: '$default',
    },
    body,
    isBase64Encoded: false,
  };
}

test('a GET through the Lambda handler returns the API response', async () => {
  const res = await handler(httpApiEvent('GET', '/api/v1/health'), {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.isBase64Encoded, false);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.equal(JSON.parse(res.body).record_counts.installations, 200);
});

test('query strings and headers reach Express (pagination links, auth)', async () => {
  const res = await handler(
    httpApiEvent('GET', '/api/v1/provinces', {
      query: 'page=2&page_size=4',
      headers: { authorization: bearer('admin') },
    }),
    {},
  );

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.pagination.page, 2);
  // Links stay relative, with no stage prefix ($default stage).
  assert.equal(body.links.self, '/api/v1/provinces?page=2&page_size=4');
});

test('a POST body reaches Express, and errors keep the error contract', async () => {
  const res = await handler(
    httpApiEvent('POST', '/api/v1/auth/tokens', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
    }),
    {},
  );

  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).error.code, 'UNAUTHORIZED');
});

test('Swagger UI and its static assets load through the handler', async () => {
  const page = await handler(httpApiEvent('GET', '/api-docs/'), {});
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /swagger-ui/);

  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
    const res = await handler(httpApiEvent('GET', `/api-docs/${asset}`), {});
    assert.equal(res.statusCode, 200, asset);
    assert.equal(res.isBase64Encoded, false, asset);
  }

  // The favicon is binary, so it must come back base64 encoded, intact.
  const icon = await handler(httpApiEvent('GET', '/api-docs/favicon-32x32.png'), {});
  assert.equal(icon.statusCode, 200);
  assert.equal(icon.isBase64Encoded, true);
  const png = Buffer.from(icon.body, 'base64');
  assert.deepEqual([...png.subarray(1, 4)], [...Buffer.from('PNG')]);
});

test('an unreachable database gives 503 in the error contract', async (t) => {
  t.mock.property(config, 'dataSource', 'mongo');
  t.mock.method(db, 'connect', async () => {
    throw new Error('connection timed out');
  });
  t.mock.method(console, 'error', () => {});

  const res = await handler(httpApiEvent('GET', '/api/v1/health'), {});

  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The database is unreachable; try again shortly',
      details: [],
    },
  });
});
