// Conditional GET: ETag, Last-Modified, Cache-Control and 304 round trips.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const seedInstallations = require('../data/seed/installations.json');

// Every read needs a token; admin sees everything, so these tests are not
// affected by jurisdiction (tested in jurisdiction.test.js).
const ADMIN = bearer('admin');
const api = (path) => request(app).get(`/api/v1${path}`).set('Authorization', ADMIN);

test('responses carry a strong ETag and Cache-Control: private, no-cache', async () => {
  for (const path of [
    '/provinces',
    '/provinces/WP',
    '/installations',
    '/installations/INST-0001',
  ]) {
    const res = await api(path);
    assert.match(res.headers.etag, /^"[A-Za-z0-9_-]+"$/, path); // quoted, no W/ prefix
    assert.equal(res.headers['cache-control'], 'private, no-cache', path);
  }
});

test('the same request gives the same ETag; a different body gives a different one', async () => {
  const first = await api('/installations?page=1');
  const again = await api('/installations?page=1');
  const other = await api('/installations?page=2');

  assert.equal(first.headers.etag, again.headers.etag);
  assert.notEqual(first.headers.etag, other.headers.etag);
});

test('an installation has Last-Modified set from its updated_at', async () => {
  const installation = seedInstallations.find((i) => i.id === 'INST-0001');
  const res = await api('/installations/INST-0001');
  assert.equal(res.headers['last-modified'], new Date(installation.updated_at).toUTCString());
});

test('a collection has Last-Modified set from its newest updated_at', async () => {
  const newest = seedInstallations
    .map((i) => i.updated_at)
    .sort()
    .at(-1);
  const res = await api('/installations');
  assert.equal(res.headers['last-modified'], new Date(newest).toUTCString());
});

test('If-None-Match with the current ETag returns 304 with an empty body', async () => {
  const first = await api('/installations?status=active');
  assert.equal(first.status, 200);

  const second = await api('/installations?status=active').set('If-None-Match', first.headers.etag);
  assert.equal(second.status, 304);
  assert.equal(second.text, '');
  assert.equal(second.headers.etag, first.headers.etag);
});

test('If-None-Match round trip works for a single resource too', async () => {
  const first = await api('/provinces/WP');
  const second = await api('/provinces/WP').set('If-None-Match', first.headers.etag);
  assert.equal(second.status, 304);
});

test('If-None-Match with an old ETag returns 200 and the body', async () => {
  const res = await api('/provinces/WP').set('If-None-Match', '"an-old-etag"');
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'WP');
});

test('If-Modified-Since at or after Last-Modified returns 304', async () => {
  const first = await api('/installations/INST-0001');
  const second = await api('/installations/INST-0001').set(
    'If-Modified-Since',
    first.headers['last-modified'],
  );
  assert.equal(second.status, 304);
});

test('If-Modified-Since before Last-Modified returns 200', async () => {
  const res = await api('/installations/INST-0001').set(
    'If-Modified-Since',
    new Date('2000-01-01T00:00:00Z').toUTCString(),
  );
  assert.equal(res.status, 200);
});

test('If-None-Match takes precedence over If-Modified-Since', async () => {
  const first = await api('/installations/INST-0001');
  // The date alone would give 304, but the ETag does not match, so 200.
  const res = await api('/installations/INST-0001')
    .set('If-None-Match', '"an-old-etag"')
    .set('If-Modified-Since', first.headers['last-modified']);
  assert.equal(res.status, 200);
});

test('a conditional request from fetch() (with Cache-Control: no-cache) still gets 304', async () => {
  // Browsers and Node's fetch() add these headers to any request that carries
  // If-None-Match; they must not stop the server from answering 304.
  const first = await api('/provinces/WP');
  const second = await api('/provinces/WP')
    .set('If-None-Match', first.headers.etag)
    .set('Cache-Control', 'no-cache')
    .set('Pragma', 'no-cache');
  assert.equal(second.status, 304);
});
