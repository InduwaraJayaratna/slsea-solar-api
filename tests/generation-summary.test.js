// GET /districts/{district_id}/generation-summary, checked against a
// brute-force calculation straight from the seed files.
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');
const clock = require('../src/utils/clock');
const seedInstallations = require('../data/seed/installations.json');
const seedSubstations = require('../data/seed/substations.json');
const seedDistricts = require('../data/seed/districts.json');
const seedReadings = require('../data/seed/readings.json');
const { DAY_MS, SEED_END_MS, toIso, sriLankaDateOf } = require('./helpers/seed-window');

// Ten minutes after the seed's last reading, so active installations are reporting.
const NOW = SEED_END_MS + 10 * 60 * 1000;
mock.method(clock, 'now', () => NOW);

// Sri Lanka dates: today (when NOW falls) and whole days inside the seed window.
const TODAY = sriLankaDateOf(NOW);
const daysAgo = (n) => sriLankaDateOf(NOW - n * DAY_MS);
const YESTERDAY = daysAgo(1);

const ADMIN = bearer('admin');
const summary = (districtId, query = '', token = ADMIN) =>
  request(app)
    .get(`/api/v1/districts/${districtId}/generation-summary${query}`)
    .set('Authorization', token);

const round3 = (value) => Number(value.toFixed(3));

// The calculated figures of a response, without district, date and generated_at.
function figuresOf(body) {
  const figures = { ...body };
  delete figures.district;
  delete figures.date;
  delete figures.generated_at;
  return figures;
}

// The summary for one district and Sri Lanka day, computed the slow, obvious
// way: by scanning every seed reading.
function bruteForce(districtId, date) {
  const dayStart = Date.parse(`${date}T00:00:00+05:30`);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const installations = seedInstallations.filter((i) => i.district_id === districtId);

  const perInstallation = installations.map((installation) => {
    const readings = seedReadings
      .filter((r) => r.installation_id === installation.id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const time = (r) => Date.parse(r.timestamp);
    const before = readings.filter((r) => time(r) < dayStart).at(-1);
    const inDay = readings.filter((r) => time(r) >= dayStart && time(r) < dayEnd);
    const latest = readings.at(-1);
    const reporting = latest !== undefined && NOW - time(latest) <= 30 * 60 * 1000;
    const energy = inDay.length ? inDay.at(-1).energy_kwh - (before ?? inDay[0]).energy_kwh : 0;
    return { installation, inDay, reporting, power: reporting ? latest.power_kw : 0, energy };
  });

  // District power at each moment of the day, then the highest.
  const powerAt = new Map();
  for (const { inDay } of perInstallation) {
    for (const r of inDay) powerAt.set(r.timestamp, (powerAt.get(r.timestamp) ?? 0) + r.power_kw);
  }
  const [peakAt, peakPower] = [...powerAt].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];

  const total = (items, f) => items.reduce((sum, item) => sum + f(item), 0);
  const capacity = total(installations, (i) => i.capacity_kw);
  const power = total(perInstallation, (p) => p.power);
  const reporting = perInstallation.filter((p) => p.reporting).length;
  return {
    installation_count: installations.length,
    reporting_count: reporting,
    offline_count: installations.length - reporting,
    current_power_kw: round3(power),
    energy_today_kwh: round3(total(perInstallation, (p) => p.energy)),
    installed_capacity_kw: round3(capacity),
    utilisation_pct: Number(((power / capacity) * 100).toFixed(2)),
    peak_power_kw: round3(peakPower),
    peak_at: peakAt,
    by_substation: seedSubstations
      .filter((s) => s.district_id === districtId)
      .map((s) => {
        const on = perInstallation.filter((p) => p.installation.substation_id === s.id);
        return {
          substation_id: s.id,
          name: s.name,
          installation_count: on.length,
          current_power_kw: round3(total(on, (p) => p.power)),
          energy_today_kwh: round3(total(on, (p) => p.energy)),
        };
      }),
  };
}

test('the totals equal a brute-force calculation over the seed (Colombo, yesterday)', async () => {
  const res = await summary('COL', `?date=${YESTERDAY}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.district, { id: 'COL', name: 'Colombo', province_id: 'WP' });
  assert.equal(res.body.date, YESTERDAY);
  assert.equal(res.body.generated_at, toIso(NOW));
  const figures = figuresOf(res.body);
  assert.deepEqual(figures, bruteForce('COL', YESTERDAY));
  assert.ok(figures.energy_today_kwh > 0 && figures.peak_power_kw > 0); // a sunny day
});

test('the totals also match for a district with offline installations', async () => {
  // The district of the first installation that is not active.
  const districtId = seedInstallations.find((i) => i.status !== 'active').district_id;
  const res = await summary(districtId, `?date=${daysAgo(3)}`);
  const figures = figuresOf(res.body);
  assert.deepEqual(figures, bruteForce(districtId, daysAgo(3)));
  assert.ok(figures.offline_count > 0);
});

test('the date defaults to today in Sri Lanka', async () => {
  const res = await summary('COL');
  assert.equal(res.body.date, TODAY);
});

test('energy_today_kwh is never negative, for any district or day', async () => {
  const dates = [6, 4, 3, 1, 0].map(daysAgo);
  for (const { id } of seedDistricts) {
    for (const date of dates) {
      const res = await summary(id, `?date=${date}`);
      assert.ok(res.body.energy_today_kwh >= 0, `${id} ${date}`);
      for (const substation of res.body.by_substation) {
        assert.ok(substation.energy_today_kwh >= 0, `${id} ${substation.substation_id} ${date}`);
      }
    }
  }
});

test('a day before the seed starts has no energy and no peak', async () => {
  const res = await summary('COL', '?date=2026-09-01');
  assert.equal(res.body.energy_today_kwh, 0);
  assert.equal(res.body.peak_power_kw, 0);
  assert.equal(res.body.peak_at, null);
});

test('a district user gets their own district, and 403 for another district', async () => {
  const colombo = bearer('dist.col');
  assert.equal((await summary('COL', '', colombo)).status, 200);
  assertError(await summary('GAM', '', colombo), 403, 'FORBIDDEN');
  assertError(await summary('KAN', '', colombo), 403, 'FORBIDDEN');
});

test('an unknown district returns 404', async () => {
  assertError(await summary('XXX'), 404, 'NOT_FOUND');
});

test('an invalid or future date returns 400 naming date', async () => {
  for (const date of ['2026-02-30', '06-10-2026', '2026-10-6', 'today', '2026-10-05T00:00:00Z']) {
    const res = await summary('COL', `?date=${date}`);
    assertError(res, 400, 'BAD_REQUEST');
    assert.deepEqual(
      res.body.error.details.map((d) => d.parameter),
      ['date'],
      date,
    );
  }
  const future = await summary('COL', `?date=${daysAgo(-2)}`);
  assertError(future, 400, 'BAD_REQUEST');
  assert.equal(future.body.error.details[0].message, 'must not be in the future');
});

test('the summary needs a token', async () => {
  const res = await request(app).get('/api/v1/districts/COL/generation-summary');
  assertError(res, 401, 'UNAUTHORIZED');
});

test('conditional GET: a weak ETag that survives a new generated_at, giving 304', async () => {
  const first = await summary('COL', `?date=${YESTERDAY}`);
  assert.match(first.headers.etag, /^W\//);

  // A second later the body has a new generated_at, but the figures are the same.
  clock.now.mock.mockImplementation(() => NOW + 1000);
  const second = await summary('COL', `?date=${YESTERDAY}`).set(
    'If-None-Match',
    first.headers.etag,
  );
  assert.equal(second.status, 304);
  clock.now.mock.mockImplementation(() => NOW);
});
