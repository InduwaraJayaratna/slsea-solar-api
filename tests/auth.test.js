// User authentication: logging in, and access tokens on every read endpoint.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');
const config = require('../src/config');
const seedUsers = require('../data/seed/users.json');
const { DAY_MS, SEED_END_MS, utcDateOf } = require('./helpers/seed-window');

const DEMO_PASSWORD = 'SolarDemo#2026';
const login = (body) => request(app).post('/api/v1/auth/tokens').send(body);

// Every GET endpoint except /health.
const READ_PATHS = [
  '/provinces',
  '/provinces/WP',
  '/provinces/WP/districts',
  '/districts/COL',
  '/districts/COL/substations',
  '/substations/SUB-001',
  '/substations/SUB-001/installations',
  '/installations',
  '/installations/INST-0001',
  '/installations/INST-0001/overview',
  '/installations/INST-0001/last-reading',
  '/installations/INST-0001/readings',
  `/installations/INST-0001/readings/INST-0001-${utcDateOf(SEED_END_MS - 3 * DAY_MS).replaceAll('-', '')}T0600Z`,
  '/readings',
];

// --- Login -----------------------------------------------------------------------

test('POST /auth/tokens with valid credentials returns a Bearer token', async () => {
  const res = await login({ username: 'dist.col', password: DEMO_PASSWORD });

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), ['access_token', 'token_type', 'expires_in']);
  assert.equal(res.body.token_type, 'Bearer');
  assert.equal(res.body.expires_in, 3600);
  assert.equal(res.headers['cache-control'], 'no-store');

  const claims = jwt.verify(res.body.access_token, config.jwtSecret);
  assert.equal(claims.sub, seedUsers.find((u) => u.username === 'dist.col').id);
  assert.equal(claims.role, 'district');
  assert.equal(claims.province_id, 'WP');
  assert.equal(claims.district_id, 'COL');
});

test('the token from login works on a read endpoint', async () => {
  const { body } = await login({ username: 'national1', password: DEMO_PASSWORD });
  const res = await request(app)
    .get('/api/v1/provinces')
    .set('Authorization', `Bearer ${body.access_token}`);
  assert.equal(res.status, 200);
});

test('a wrong password and an unknown user get the same 401', async () => {
  const wrongPassword = await login({ username: 'dist.col', password: 'not-the-password' });
  const unknownUser = await login({ username: 'nobody', password: DEMO_PASSWORD });

  assertError(wrongPassword, 401, 'UNAUTHORIZED');
  assertError(unknownUser, 401, 'UNAUTHORIZED');
  assert.equal(wrongPassword.body.error.message, unknownUser.body.error.message);
  assert.match(wrongPassword.headers['www-authenticate'], /^Bearer /);
});

test('a login body with missing, empty or extra fields returns 400', async () => {
  const missing = await login({ username: 'admin' });
  assertError(missing, 400, 'BAD_REQUEST');
  assert.deepEqual(
    missing.body.error.details.map((d) => d.field),
    ['password'],
  );

  const extra = await login({ username: 'admin', password: DEMO_PASSWORD, role: 'admin' });
  assertError(extra, 400, 'BAD_REQUEST');
  assert.deepEqual(
    extra.body.error.details.map((d) => d.field),
    ['role'],
  );

  assertError(await login({ username: '', password: '' }), 400, 'BAD_REQUEST');
  assertError(await login([]), 400, 'BAD_REQUEST');
});

test('GET /auth/tokens returns 405', async () => {
  const res = await request(app).get('/api/v1/auth/tokens');
  assertError(res, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(res.headers.allow, 'POST');
});

// --- Tokens on read endpoints ----------------------------------------------------

test('every read endpoint returns 401 with WWW-Authenticate: Bearer without a token', async () => {
  for (const path of READ_PATHS) {
    const res = await request(app).get(`/api/v1${path}`);
    assertError(res, 401, 'UNAUTHORIZED');
    assert.equal(res.headers['www-authenticate'], 'Bearer realm="slsea-solar-api"', path);
  }
});

test('every read endpoint works with a valid token', async () => {
  const admin = bearer('admin');
  for (const path of READ_PATHS) {
    const res = await request(app).get(`/api/v1${path}`).set('Authorization', admin);
    assert.equal(res.status, 200, path);
  }
});

test('/health stays open', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);
});

test('an expired token returns 401 invalid_token', async () => {
  const expired = jwt.sign({ role: 'admin' }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: 'USR-001',
    expiresIn: -60, // expired a minute ago
  });
  const res = await request(app).get('/api/v1/provinces').set('Authorization', `Bearer ${expired}`);

  assertError(res, 401, 'UNAUTHORIZED');
  assert.equal(res.body.error.message, 'Access token has expired');
  assert.match(res.headers['www-authenticate'], /error="invalid_token"/);
});

test('malformed or forged tokens return 401', async () => {
  const forged = jwt.sign({ role: 'admin' }, 'some-other-secret-that-is-long-enough!!', {
    subject: 'USR-001',
  });
  // An unsigned token ("alg": "none") must never be accepted.
  const unsigned = jwt.sign({ role: 'admin', sub: 'USR-001' }, null, { algorithm: 'none' });
  const wrongRole = jwt.sign({ role: 'superuser' }, config.jwtSecret, { subject: 'USR-001' });

  for (const header of [
    'Bearer',
    'Bearer not-a-jwt',
    `Basic ${Buffer.from('admin:x').toString('base64')}`,
    `Bearer ${forged}`,
    `Bearer ${unsigned}`,
    `Bearer ${wrongRole}`,
    `${bearer('admin')} extra`,
  ]) {
    const res = await request(app).get('/api/v1/provinces').set('Authorization', header);
    assertError(res, 401, 'UNAUTHORIZED');
    assert.match(res.headers['www-authenticate'], /error="invalid_token"/, header);
  }
});

test('a device key does not work on a read endpoint', async () => {
  const res = await request(app)
    .get('/api/v1/installations/INST-0001/readings')
    .set('X-Device-Key', 'dk_anything');
  assertError(res, 401, 'UNAUTHORIZED');
});

test('responses carry security headers from helmet and CORS headers', async () => {
  const res = await request(app).get('/api/v1/health').set('Origin', 'https://dashboard.test');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.match(res.headers['access-control-expose-headers'], /ETag/);
});
