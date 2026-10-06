// The hierarchy read path: provinces -> districts -> substations -> installations.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');
const repositories = require('../src/repositories');
const seedInstallations = require('../data/seed/installations.json');

// Every read needs a token; admin sees everything, so these tests are not
// affected by jurisdiction (tested in jurisdiction.test.js).
const ADMIN = bearer('admin');
const api = (path) => request(app).get(`/api/v1${path}`).set('Authorization', ADMIN);

// --- Provinces -----------------------------------------------------------------

test('GET /provinces lists all 9 provinces in one page', async () => {
  const res = await api('/provinces');

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 9);
  assert.deepEqual(res.body.pagination, { total: 9, page: 1, page_size: 50, total_pages: 1 });
  assert.deepEqual(res.body.links, {
    self: '/api/v1/provinces?page=1&page_size=50',
    first: '/api/v1/provinces?page=1&page_size=50',
    last: '/api/v1/provinces?page=1&page_size=50',
    next: null,
    prev: null,
  });
  assert.equal(res.headers.link, undefined);
});

test('GET /provinces/{province_id} returns the bare province', async () => {
  const res = await api('/provinces/WP');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: 'WP', name: 'Western' });
});

test('GET /provinces/{province_id} returns 404 for an unknown province', async () => {
  assertError(await api('/provinces/XX'), 404, 'NOT_FOUND');
});

// --- Districts -----------------------------------------------------------------

test('GET /provinces/{province_id}/districts lists that province only', async () => {
  const res = await api('/provinces/WP/districts');

  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.data.map((d) => d.id),
    ['COL', 'GAM', 'KAL'],
  );
  assert.equal(res.body.pagination.total, 3);
});

test('all 25 districts are reachable through their provinces', async () => {
  const provinces = (await api('/provinces')).body.data;
  let total = 0;
  for (const province of provinces) {
    total += (await api(`/provinces/${province.id}/districts`)).body.pagination.total;
  }
  assert.equal(total, 25);
});

test('GET /provinces/{province_id}/districts returns 404 when the province does not exist', async () => {
  assertError(await api('/provinces/XX/districts'), 404, 'NOT_FOUND');
});

test('GET /districts/{district_id} returns the bare district', async () => {
  const res = await api('/districts/COL');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: 'COL', name: 'Colombo', province_id: 'WP' });
});

test('GET /districts/{district_id} returns 404 for an unknown district', async () => {
  assertError(await api('/districts/XXX'), 404, 'NOT_FOUND');
});

// --- Substations ---------------------------------------------------------------

test('GET /districts/{district_id}/substations lists that district only', async () => {
  const res = await api('/districts/COL/substations');

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 3);
  assert.ok(res.body.data.every((s) => s.district_id === 'COL'));
});

test('GET /districts/{district_id}/substations returns 404 when the district does not exist', async () => {
  assertError(await api('/districts/XXX/substations'), 404, 'NOT_FOUND');
});

test('GET /substations/{substation_id} returns the bare substation', async () => {
  const res = await api('/substations/SUB-001');

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    'id',
    'name',
    'district_id',
    'voltage_kv',
    'capacity_mva',
    'latitude',
    'longitude',
  ]);
  assert.equal(res.body.id, 'SUB-001');
});

test('GET /substations/{substation_id} returns 404 for an unknown substation', async () => {
  assertError(await api('/substations/SUB-999'), 404, 'NOT_FOUND');
});

// --- Installations -------------------------------------------------------------

test('GET /substations/{substation_id}/installations lists that substation only', async () => {
  const expected = seedInstallations.filter((i) => i.substation_id === 'SUB-001').length;
  const res = await api('/substations/SUB-001/installations');

  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, expected);
  assert.ok(res.body.data.every((i) => i.substation_id === 'SUB-001'));
});

test('GET /substations/{substation_id}/installations returns 404 when the substation does not exist', async () => {
  assertError(await api('/substations/SUB-999/installations'), 404, 'NOT_FOUND');
});

test('a parent with no children returns 200 and an empty page', async (t) => {
  // Every seed substation has installations, so stand in an empty result.
  t.mock.method(repositories.installations, 'findAll', async () => []);
  const res = await api('/substations/SUB-001/installations');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
  assert.deepEqual(res.body.pagination, { total: 0, page: 1, page_size: 50, total_pages: 0 });
  assert.equal(res.body.links.next, null);
});

test('GET /installations pages through all 200 installations', async () => {
  const res = await api('/installations');

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 50);
  assert.deepEqual(res.body.pagination, { total: 200, page: 1, page_size: 50, total_pages: 4 });
  assert.equal(res.body.links.next, '/api/v1/installations?page=2&page_size=50');
  assert.equal(res.body.links.last, '/api/v1/installations?page=4&page_size=50');
  assert.equal(res.headers.link, '</api/v1/installations?page=2&page_size=50>; rel="next"');
});

test('a middle page links to the next and previous pages in the body and Link header', async () => {
  const res = await api('/installations?page=2&page_size=50');

  assert.equal(res.body.links.prev, '/api/v1/installations?page=1&page_size=50');
  assert.equal(res.body.links.next, '/api/v1/installations?page=3&page_size=50');
  assert.equal(
    res.headers.link,
    '</api/v1/installations?page=3&page_size=50>; rel="next", </api/v1/installations?page=1&page_size=50>; rel="prev"',
  );
});

test('GET /installations filters combine and are kept in the pagination links', async () => {
  const expected = seedInstallations.filter(
    (i) => i.district_id === 'COL' && i.status === 'active',
  ).length;
  const res = await api('/installations?district_id=COL&status=active&page_size=5');

  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, expected);
  assert.ok(res.body.data.every((i) => i.district_id === 'COL' && i.status === 'active'));
  assert.equal(
    res.body.links.next,
    '/api/v1/installations?district_id=COL&status=active&page_size=5&page=2',
  );
});

test('GET /installations filters by province, substation and status', async () => {
  const count = (filter) => seedInstallations.filter(filter).length;

  const byProvince = await api('/installations?province_id=WP');
  assert.equal(
    byProvince.body.pagination.total,
    count((i) => i.province_id === 'WP'),
  );

  const bySubstation = await api('/installations?substation_id=SUB-002');
  assert.equal(
    bySubstation.body.pagination.total,
    count((i) => i.substation_id === 'SUB-002'),
  );

  const byStatus = await api('/installations?status=maintenance');
  assert.equal(
    byStatus.body.pagination.total,
    count((i) => i.status === 'maintenance'),
  );
});

test('a well-formed filter that matches nothing returns an empty page', async () => {
  const res = await api('/installations?district_id=ZZZ');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, 0);
});

test('GET /installations/{installation_id} returns the bare installation without internal fields', async () => {
  const res = await api('/installations/INST-0001');

  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'INST-0001');
  assert.equal(res.body.device_key_hash, undefined);
  assert.equal(res.body.data, undefined); // atomic resources are not wrapped
});

test('installation collections never include device_key_hash', async () => {
  const res = await api('/installations?page_size=200');
  assert.equal(res.body.data.length, 200);
  assert.ok(res.body.data.every((i) => !('device_key_hash' in i)));
});

test('GET /installations/{installation_id} returns 404 for an unknown installation', async () => {
  assertError(await api('/installations/INST-9999'), 404, 'NOT_FOUND');
});

test('write methods on read-only resources return 405', async () => {
  const res = await request(app).delete('/api/v1/installations/INST-0001');
  assertError(res, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(res.headers.allow, 'GET, HEAD');
});
