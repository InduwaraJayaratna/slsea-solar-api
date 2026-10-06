// Unit tests for authenticateDevice. There is no device endpoint yet, so the
// middleware is mounted on a throwaway route. The installations repository is
// stubbed with two installations whose keys the test knows.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
require('./helpers/test-env');
const authenticateDevice = require('../src/middleware/authenticate-device');
const errorHandler = require('../src/middleware/error-handler');
const repositories = require('../src/repositories');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');

const sha256Hex = (text) => crypto.createHash('sha256').update(text).digest('hex');
const KEYS = { 'INST-A': 'dk_key-for-a', 'INST-B': 'dk_key-for-b' };
const INSTALLATIONS = Object.entries(KEYS).map(([id, key]) => ({
  id,
  device_key_hash: sha256Hex(key),
}));

const app = express();
app.post('/installations/:installation_id/device-test', authenticateDevice, (req, res) => {
  res.json({ device: req.device });
});
app.use(errorHandler);

beforeEach((t) => {
  t.mock.method(
    repositories.installations,
    'findById',
    async (id) => INSTALLATIONS.find((i) => i.id === id) ?? null,
  );
  t.mock.method(repositories.installations, 'findAll', async (filter) =>
    INSTALLATIONS.filter((i) => i.device_key_hash === filter.device_key_hash),
  );
});

const post = (installationId) => request(app).post(`/installations/${installationId}/device-test`);

test('the right key for the installation passes and sets req.device', async () => {
  const res = await post('INST-A').set('X-Device-Key', KEYS['INST-A']);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device, { installation_id: 'INST-A' });
});

test('a missing key returns 401 with a DeviceKey challenge', async () => {
  const res = await post('INST-A');
  assertError(res, 401, 'UNAUTHORIZED');
  assert.match(res.headers['www-authenticate'], /^DeviceKey /);
});

test("another installation's valid key returns 403", async () => {
  assertError(await post('INST-A').set('X-Device-Key', KEYS['INST-B']), 403, 'FORBIDDEN');
});

test('a key that belongs to no installation returns 401', async () => {
  assertError(await post('INST-A').set('X-Device-Key', 'dk_made-up'), 401, 'UNAUTHORIZED');
});

test('a user access token does not work on the device path', async () => {
  const res = await post('INST-A').set('Authorization', bearer('admin'));
  assertError(res, 401, 'UNAUTHORIZED');
});

test('an unknown installation returns 404', async () => {
  assertError(await post('INST-Z').set('X-Device-Key', KEYS['INST-A']), 404, 'NOT_FOUND');
});

test('the key is checked with crypto.timingSafeEqual', async (t) => {
  const spy = t.mock.method(crypto, 'timingSafeEqual');
  await post('INST-A').set('X-Device-Key', KEYS['INST-A']);
  assert.equal(spy.mock.callCount(), 1);
});
