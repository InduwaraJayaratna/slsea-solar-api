// Device ingestion: POST /installations/{installation_id}/readings.
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const { createInstallation } = require('./helpers/installations');
const assertError = require('./helpers/assert-error');
const clock = require('../src/utils/clock');

// A fixed "now", so the future-timestamp rule is predictable.
const NOW = Date.parse('2026-10-06T12:00:00Z');
mock.method(clock, 'now', () => NOW);

const ADMIN = bearer('admin');

function ingest(installationId, key, body) {
  const req = request(app).post(`/api/v1/installations/${installationId}/readings`);
  if (key) req.set('X-Device-Key', key);
  return req.send(body);
}

const reading = (overrides = {}) => ({
  timestamp: '2026-10-06T11:45:00Z',
  power_kw: 3.25,
  energy_kwh: 100,
  voltage_v: 231.4,
  ...overrides,
});

test('a device posts a reading: 201, Location resolves, last-reading returns it', async () => {
  const { body: installation } = await createInstallation();
  const res = await ingest(installation.id, installation.device_key, reading());

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, {
    id: `${installation.id}-20261006T1145Z`,
    installation_id: installation.id,
    timestamp: '2026-10-06T11:45:00Z',
    power_kw: 3.25,
    energy_kwh: 100,
    voltage_v: 231.4,
  });
  assert.equal(
    res.headers.location,
    `/api/v1/installations/${installation.id}/readings/${res.body.id}`,
  );

  const fetched = await request(app).get(res.headers.location).set('Authorization', ADMIN);
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body, res.body);

  const last = await request(app)
    .get(`/api/v1/installations/${installation.id}/last-reading`)
    .set('Authorization', ADMIN);
  assert.equal(last.body.id, res.body.id);
  assert.equal(last.body.age_seconds, 15 * 60);
});

test('sending the same reading again returns 409 DUPLICATE_READING', async () => {
  const { body: installation } = await createInstallation();
  assert.equal((await ingest(installation.id, installation.device_key, reading())).status, 201);

  const retry = await ingest(installation.id, installation.device_key, reading());
  assertError(retry, 409, 'DUPLICATE_READING');

  const history = await request(app)
    .get(`/api/v1/installations/${installation.id}/readings`)
    .set('Authorization', ADMIN);
  assert.equal(history.body.pagination.total, 1); // stored once
});

test("another installation's device key returns 403", async () => {
  const { body: first } = await createInstallation();
  const { body: second } = await createInstallation();
  assertError(await ingest(first.id, second.device_key, reading()), 403, 'FORBIDDEN');
});

test('a missing or unknown device key returns 401', async () => {
  const { body: installation } = await createInstallation();
  assertError(await ingest(installation.id, null, reading()), 401, 'UNAUTHORIZED');
  assertError(await ingest(installation.id, 'dk_wrong', reading()), 401, 'UNAUTHORIZED');
});

test('a user access token cannot ingest readings (401)', async () => {
  const { body: installation } = await createInstallation();
  const res = await request(app)
    .post(`/api/v1/installations/${installation.id}/readings`)
    .set('Authorization', ADMIN)
    .send(reading());
  assertError(res, 401, 'UNAUTHORIZED');
});

test('a bad body returns 400 with one details entry per bad field', async () => {
  const { body: installation } = await createInstallation();
  const res = await ingest(installation.id, installation.device_key, {
    timestamp: '2026-10-06 11:45', // not ISO 8601 UTC
    power_kw: -1,
    energy_kwh: '100', // a string, not a number
    // voltage_v missing
    note: 'hello', // not a field
  });

  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), [
    'energy_kwh',
    'note',
    'power_kw',
    'timestamp',
    'voltage_v',
  ]);
});

test('voltage must be above 0 and timestamps must be UTC on a whole minute', async () => {
  const { body: installation } = await createInstallation();
  for (const bad of [
    { voltage_v: 0 },
    { timestamp: '2026-10-06T17:15:00+05:30' },
    { timestamp: '2026-10-06T11:45:30Z' },
  ]) {
    const res = await ingest(installation.id, installation.device_key, reading(bad));
    assertError(res, 400, 'BAD_REQUEST');
  }
});

test('a timestamp more than 5 minutes in the future returns 400', async () => {
  const { body: installation } = await createInstallation();
  const tooLate = await ingest(
    installation.id,
    installation.device_key,
    reading({ timestamp: '2026-10-06T12:06:00Z' }),
  );
  assertError(tooLate, 400, 'BAD_REQUEST');
  assert.equal(tooLate.body.error.details[0].field, 'timestamp');

  // Up to 5 minutes ahead is tolerated (a device clock running slightly fast).
  const slightlyAhead = await ingest(
    installation.id,
    installation.device_key,
    reading({ timestamp: '2026-10-06T12:05:00Z' }),
  );
  assert.equal(slightlyAhead.status, 201);
});

test('an energy_kwh lower than the previous reading returns 409', async () => {
  const { body: installation } = await createInstallation();
  const key = installation.device_key;
  await ingest(
    installation.id,
    key,
    reading({ timestamp: '2026-10-06T11:00:00Z', energy_kwh: 100 }),
  );

  const lower = await ingest(
    installation.id,
    key,
    reading({ timestamp: '2026-10-06T11:15:00Z', energy_kwh: 99.5 }),
  );
  assertError(lower, 409, 'ENERGY_DECREASED');

  // A late reading filling a gap must also fit below the next reading.
  await ingest(
    installation.id,
    key,
    reading({ timestamp: '2026-10-06T11:45:00Z', energy_kwh: 102 }),
  );
  const tooHigh = await ingest(
    installation.id,
    key,
    reading({ timestamp: '2026-10-06T11:30:00Z', energy_kwh: 103 }),
  );
  assertError(tooHigh, 409, 'ENERGY_DECREASED');
  const fits = await ingest(
    installation.id,
    key,
    reading({ timestamp: '2026-10-06T11:30:00Z', energy_kwh: 101 }),
  );
  assert.equal(fits.status, 201);
});

test('a write to an installation that is not active returns 409', async () => {
  const { body: installation } = await createInstallation({ status: 'maintenance' });
  assertError(
    await ingest(installation.id, installation.device_key, reading()),
    409,
    'INSTALLATION_NOT_ACTIVE',
  );
});

test('readings are append-only: PUT, PATCH and DELETE return 405', async () => {
  const collection = '/api/v1/installations/INST-0001/readings';
  const item = `${collection}/INST-0001-20261001T0600Z`;
  for (const method of ['put', 'patch', 'delete']) {
    const onCollection = await request(app)[method](collection).set('Authorization', ADMIN);
    assertError(onCollection, 405, 'METHOD_NOT_ALLOWED');
    assert.equal(onCollection.headers.allow, 'GET, HEAD, POST');

    const onItem = await request(app)[method](item).set('Authorization', ADMIN);
    assertError(onItem, 405, 'METHOD_NOT_ALLOWED');
    assert.equal(onItem.headers.allow, 'GET, HEAD');
  }
});
