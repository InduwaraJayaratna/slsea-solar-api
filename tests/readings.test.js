// Reading history (per installation) and estate-wide reading queries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');
const seedInstallations = require('../data/seed/installations.json');
const seedReadings = require('../data/seed/readings.json');
const { DAY_MS, SEED_END_MS, utcDateOf } = require('./helpers/seed-window');

// Every read needs a token; admin sees everything, so these tests are not
// affected by jurisdiction (tested in jurisdiction.test.js).
const ADMIN = bearer('admin');
const api = (path) => request(app).get(`/api/v1${path}`).set('Authorization', ADMIN);
const parametersIn = (res) => res.body.error.details.map((d) => d.parameter);

// An installation that reported in every slot of the week.
const ACTIVE = seedInstallations.find((i) => i.status === 'active').id;
const HISTORY = `/installations/${ACTIVE}/readings`;

// A whole UTC day inside the seed window (DAY), and the days either side.
const PREVIOUS_DAY = utcDateOf(SEED_END_MS - 4 * DAY_MS);
const DAY = utcDateOf(SEED_END_MS - 3 * DAY_MS);
const NEXT_DAY = utcDateOf(SEED_END_MS - 2 * DAY_MS);

test('history pages do not overlap and the total is 672', async () => {
  const page1 = await api(`${HISTORY}?page=1&page_size=100`);
  const page2 = await api(`${HISTORY}?page=2&page_size=100`);

  assert.equal(page1.status, 200);
  assert.equal(page1.body.pagination.total, 672);
  assert.equal(page2.body.pagination.total, 672);
  assert.equal(page1.body.data.length, 100);
  assert.equal(page2.body.data.length, 100);
  const firstIds = new Set(page1.body.data.map((r) => r.id));
  assert.ok(page2.body.data.every((r) => !firstIds.has(r.id)));
});

test('history is newest first by default and with sort=-timestamp', async () => {
  for (const path of [HISTORY, `${HISTORY}?sort=-timestamp`]) {
    const timestamps = (await api(path)).body.data.map((r) => r.timestamp);
    assert.deepEqual(timestamps, [...timestamps].sort().reverse(), path);
  }
});

test('sort=timestamp returns history oldest first', async () => {
  const timestamps = (await api(`${HISTORY}?sort=timestamp`)).body.data.map((r) => r.timestamp);
  assert.deepEqual(timestamps, [...timestamps].sort());
});

test('a one-day window returns 96 readings (from inclusive, to exclusive)', async () => {
  const res = await api(
    `${HISTORY}?from=${DAY}T00:00:00Z&to=${NEXT_DAY}T00:00:00Z&sort=timestamp&page_size=200`,
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, 96);
  assert.equal(res.body.data[0].timestamp, `${DAY}T00:00:00Z`);
  assert.equal(res.body.data.at(-1).timestamp, `${DAY}T23:45:00Z`);
});

test('a window with a time zone offset is converted to UTC', async () => {
  // Midnight to midnight in Sri Lanka is 18:30 to 18:30 UTC: still 96 slots.
  const from = encodeURIComponent(`${DAY}T00:00:00+05:30`);
  const to = encodeURIComponent(`${NEXT_DAY}T00:00:00+05:30`);
  const res = await api(`${HISTORY}?from=${from}&to=${to}&sort=timestamp`);

  assert.equal(res.body.pagination.total, 96);
  assert.equal(res.body.data[0].timestamp, `${PREVIOUS_DAY}T18:30:00Z`);
});

test('pagination links keep the window and sort', async () => {
  const res = await api(`${HISTORY}?from=${DAY}&to=${NEXT_DAY}&sort=timestamp&page_size=10`);
  const next = new URL(res.body.links.next, 'http://localhost');

  assert.equal(next.pathname, `/api/v1${HISTORY}`);
  assert.equal(next.searchParams.get('from'), DAY);
  assert.equal(next.searchParams.get('to'), NEXT_DAY);
  assert.equal(next.searchParams.get('sort'), 'timestamp');
  assert.equal(next.searchParams.get('page'), '2');
  assert.match(res.headers.link, /rel="next"/);
});

test('history of an unknown installation returns 404', async () => {
  assertError(await api('/installations/INST-9999/readings'), 404, 'NOT_FOUND');
});

test('GET /installations/{id}/readings/{reading_id} returns one reading', async () => {
  const readingId = `${ACTIVE}-${DAY.replaceAll('-', '')}T0600Z`;
  const res = await api(`${HISTORY}/${readingId}`);

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    'id',
    'installation_id',
    'timestamp',
    'power_kw',
    'energy_kwh',
    'voltage_v',
  ]);
  assert.equal(res.body.id, readingId);
  assert.equal(res.headers['last-modified'], new Date(`${DAY}T06:00:00Z`).toUTCString());
});

test("a reading is 404 under another installation's path", async () => {
  const otherReading = seedReadings.find((r) => r.installation_id !== ACTIVE).id;
  assertError(await api(`${HISTORY}/${otherReading}`), 404, 'NOT_FOUND');
  assertError(await api(`${HISTORY}/no-such-reading`), 404, 'NOT_FOUND');
});

test('GET /readings with no filters covers every reading, newest first', async () => {
  const res = await api('/readings');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, seedReadings.length);
});

test('the district filter returns only readings from installations in that district', async () => {
  const inColombo = new Set(
    seedInstallations.filter((i) => i.district_id === 'COL').map((i) => i.id),
  );
  const expected = seedReadings.filter((r) => inColombo.has(r.installation_id)).length;
  const res = await api('/readings?district_id=COL&page_size=200');

  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, expected);
  assert.ok(res.body.data.every((r) => inColombo.has(r.installation_id)));
});

test('jurisdiction filters combine with the time window', async () => {
  const onSubstation = new Set(
    seedInstallations.filter((i) => i.substation_id === 'SUB-001').map((i) => i.id),
  );
  const expected = seedReadings.filter(
    (r) =>
      onSubstation.has(r.installation_id) &&
      r.timestamp >= `${DAY}T00:00:00Z` &&
      r.timestamp < `${NEXT_DAY}T00:00:00Z`,
  ).length;
  const res = await api(`/readings?substation_id=SUB-001&from=${DAY}&to=${NEXT_DAY}`);

  assert.equal(res.body.pagination.total, expected);
  assert.ok(res.body.data.every((r) => onSubstation.has(r.installation_id)));
  assert.ok(res.body.data.every((r) => r.timestamp.startsWith(DAY)));
});

test('installation_id on /readings matches that installation only', async () => {
  const res = await api(`/readings?installation_id=${ACTIVE}`);
  assert.equal(res.body.pagination.total, 672);
});

test('a jurisdiction with no installations returns an empty page, not every reading', async () => {
  const res = await api('/readings?province_id=WP&district_id=KAN');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, 0);
});

test('reading collections send Last-Modified from the newest matching reading', async () => {
  const res = await api(`${HISTORY}?to=${DAY}T00:00:00Z&sort=timestamp`);
  // The newest reading before the window ends, whatever the page shows.
  assert.equal(res.headers['last-modified'], new Date(`${PREVIOUS_DAY}T23:45:00Z`).toUTCString());
});

test('a reading collection supports a 304 round trip', async () => {
  const first = await api(`${HISTORY}?page_size=20`);
  const second = await api(`${HISTORY}?page_size=20`).set('If-None-Match', first.headers.etag);
  assert.equal(second.status, 304);
  assert.equal(second.text, '');
});

// --- Validation ------------------------------------------------------------------

for (const from of ['yesterday', '2026-02-30', '2026-10-01T00:00:00', '2026-13-01']) {
  test(`from=${from} returns 400 naming from`, async () => {
    const res = await api(`${HISTORY}?from=${from}`);
    assertError(res, 400, 'BAD_REQUEST');
    assert.deepEqual(parametersIn(res), ['from']);
  });
}

test('from equal to or after to returns 400', async () => {
  for (const window of ['from=2026-10-02&to=2026-10-01', 'from=2026-10-01&to=2026-10-01']) {
    const res = await api(`/readings?${window}`);
    assertError(res, 400, 'BAD_REQUEST');
    assert.deepEqual(parametersIn(res), ['from']);
  }
});

test('an unsupported sort returns 400 naming sort', async () => {
  for (const sort of ['power_kw', '-power_kw', 'TIMESTAMP']) {
    const res = await api(`${HISTORY}?sort=${sort}`);
    assertError(res, 400, 'BAD_REQUEST');
    assert.deepEqual(parametersIn(res), ['sort']);
  }
});

test('page_size above 200 returns 400 naming page_size', async () => {
  const res = await api(`/readings?page_size=500`);
  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(parametersIn(res), ['page_size']);
});

test('jurisdiction filters are checked, and are not accepted on the history', async () => {
  const bad = await api('/readings?district_id=colombo');
  assertError(bad, 400, 'BAD_REQUEST');
  assert.deepEqual(parametersIn(bad), ['district_id']);

  const scoped = await api(`${HISTORY}?district_id=COL`);
  assertError(scoped, 400, 'BAD_REQUEST');
});
