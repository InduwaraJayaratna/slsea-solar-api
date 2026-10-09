// The operational reads: last-reading and the installation overview.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');
const clock = require('../src/utils/clock');
const repositories = require('../src/repositories');
const seedInstallations = require('../data/seed/installations.json');
const seedReadings = require('../data/seed/readings.json');
const { DAY_MS, SEED_END_MS, toIso, sriLankaDateOf } = require('./helpers/seed-window');

// Every read needs a token; admin sees everything, so these tests are not
// affected by jurisdiction (tested in jurisdiction.test.js).
const ADMIN = bearer('admin');
const api = (path) => request(app).get(`/api/v1${path}`).set('Authorization', ADMIN);
const ACTIVE = seedInstallations.find((i) => i.status === 'active').id;
const readingsOf = (id) => seedReadings.filter((r) => r.installation_id === id);

// --- last-reading ----------------------------------------------------------------

test('last-reading equals the first item of the newest-first history', async () => {
  const history = await api(`/installations/${ACTIVE}/readings?sort=-timestamp`);
  const last = await api(`/installations/${ACTIVE}/last-reading`);

  assert.equal(last.status, 200);
  const { age_seconds: age, stale, ...reading } = last.body;
  assert.deepEqual(reading, history.body.data[0]);
  assert.equal(typeof age, 'number');
  assert.equal(typeof stale, 'boolean');
});

test('last-reading is fresh up to 30 minutes old and stale after that', async (t) => {
  const latest = readingsOf(ACTIVE).at(-1);
  const readingMs = Date.parse(latest.timestamp);

  t.mock.method(clock, 'now', () => readingMs + 10 * 60 * 1000);
  const fresh = await api(`/installations/${ACTIVE}/last-reading`);
  assert.equal(fresh.body.age_seconds, 600);
  assert.equal(fresh.body.stale, false);

  clock.now.mock.mockImplementation(() => readingMs + 31 * 60 * 1000);
  const old = await api(`/installations/${ACTIVE}/last-reading`);
  assert.equal(old.body.age_seconds, 1860);
  assert.equal(old.body.stale, true);
});

test('last-reading revalidates with its weak ETag while nothing meaningful changes', async (t) => {
  const readingMs = Date.parse(readingsOf(ACTIVE).at(-1).timestamp);
  t.mock.method(clock, 'now', () => readingMs + 60 * 1000);
  const first = await api(`/installations/${ACTIVE}/last-reading`);
  assert.match(first.headers.etag, /^W\/"/);

  // A minute later age_seconds differs, but it is the same reading, still fresh.
  clock.now.mock.mockImplementation(() => readingMs + 2 * 60 * 1000);
  const second = await api(`/installations/${ACTIVE}/last-reading`).set(
    'If-None-Match',
    first.headers.etag,
  );
  assert.equal(second.status, 304);

  // Once it turns stale the representation has changed, so 200 again.
  clock.now.mock.mockImplementation(() => readingMs + 40 * 60 * 1000);
  const third = await api(`/installations/${ACTIVE}/last-reading`).set(
    'If-None-Match',
    first.headers.etag,
  );
  assert.equal(third.status, 200);
  assert.equal(third.body.stale, true);
});

test('last-reading of an unknown installation returns 404 NOT_FOUND', async () => {
  assertError(await api('/installations/INST-9999/last-reading'), 404, 'NOT_FOUND');
});

test('last-reading of an installation with no readings returns 404 NO_READINGS', async (t) => {
  t.mock.method(repositories.readings, 'findMany', async () => ({ items: [], total: 0 }));
  assertError(await api(`/installations/${ACTIVE}/last-reading`), 404, 'NO_READINGS');
});

// --- overview --------------------------------------------------------------------

test('overview contains the installation and all four hierarchy levels', async () => {
  const installation = seedInstallations.find((i) => i.id === ACTIVE);
  const res = await api(`/installations/${ACTIVE}/overview`);

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    'installation',
    'substation',
    'district',
    'province',
    'last_reading',
    'today',
  ]);
  assert.equal(res.body.installation.id, ACTIVE);
  assert.equal(res.body.installation.device_key_hash, undefined);
  assert.deepEqual(Object.keys(res.body.substation), ['id', 'name']);
  assert.equal(res.body.substation.id, installation.substation_id);
  assert.equal(res.body.district.id, installation.district_id);
  assert.equal(res.body.province.id, installation.province_id);
  assert.equal(typeof res.body.province.name, 'string');
  assert.deepEqual(res.body.last_reading, readingsOf(ACTIVE).at(-1));
});

test("overview's energy today is the meter total today minus the total before local midnight", async (t) => {
  // 23:59 in Sri Lanka on the last whole day of the seed. A Sri Lanka day runs
  // from 18:30 UTC the day before to 18:30 UTC.
  const day = sriLankaDateOf(SEED_END_MS - DAY_MS);
  const dayStart = Date.parse(`${day}T00:00:00+05:30`);
  t.mock.method(clock, 'now', () => dayStart + DAY_MS - 60 * 1000);
  const readings = readingsOf(ACTIVE);
  const beforeMidnight = readings.filter((r) => r.timestamp < toIso(dayStart)).at(-1);
  const latestToday = readings.filter((r) => r.timestamp < toIso(dayStart + DAY_MS)).at(-1);
  const expected = Number((latestToday.energy_kwh - beforeMidnight.energy_kwh).toFixed(3));

  const res = await api(`/installations/${ACTIVE}/overview`);

  assert.deepEqual(res.body.today, { date: day, energy_kwh: expected });
  assert.ok(expected > 0); // a whole day of sun
});

test("overview's energy today is 0 before the installation reports today", async (t) => {
  const later = SEED_END_MS + 60 * DAY_MS; // long after the seed ends
  t.mock.method(clock, 'now', () => later);
  const res = await api(`/installations/${ACTIVE}/overview`);
  assert.deepEqual(res.body.today, { date: sriLankaDateOf(later), energy_kwh: 0 });
});

test('overview of an unknown installation returns 404', async () => {
  assertError(await api('/installations/INST-9999/overview'), 404, 'NOT_FOUND');
});

test('overview supports a 304 round trip', async () => {
  const first = await api(`/installations/${ACTIVE}/overview`);
  const second = await api(`/installations/${ACTIVE}/overview`).set(
    'If-None-Match',
    first.headers.etag,
  );
  assert.equal(second.status, 304);
});
