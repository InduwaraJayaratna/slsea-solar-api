// Query parameter validation: pagination, filters and unknown parameters.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');

// Every read needs a token; admin sees everything, so these tests are not
// affected by jurisdiction (tested in jurisdiction.test.js).
const ADMIN = bearer('admin');
const api = (path) => request(app).get(`/api/v1${path}`).set('Authorization', ADMIN);
const parametersIn = (res) => res.body.error.details.map((d) => d.parameter);

for (const value of ['0', '-1', '1.5', 'abc', '01']) {
  test(`page=${value} returns 400 naming page`, async () => {
    const res = await api(`/provinces?page=${value}`);
    assertError(res, 400, 'BAD_REQUEST');
    assert.deepEqual(parametersIn(res), ['page']);
  });
}

for (const value of ['0', '201', 'ten']) {
  test(`page_size=${value} returns 400 naming page_size`, async () => {
    const res = await api(`/provinces?page_size=${value}`);
    assertError(res, 400, 'BAD_REQUEST');
    assert.deepEqual(parametersIn(res), ['page_size']);
  });
}

test('page_size=200 is the largest allowed', async () => {
  const res = await api('/installations?page_size=200');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.page_size, 200);
});

test('a page past the end returns an empty page that links back to the last one', async () => {
  const res = await api('/provinces?page=5&page_size=4');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.links.next, null);
  assert.equal(res.body.links.prev, '/api/v1/provinces?page=3&page_size=4');
});

test('an unknown query parameter returns 400', async () => {
  const res = await api('/provinces?sort=name');
  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(parametersIn(res), ['sort']);
});

test('a single resource rejects query parameters', async () => {
  const res = await api('/provinces/WP?page=1');
  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(parametersIn(res), ['page']);
});

test('scoped collections do not accept the estate-wide filters', async () => {
  const res = await api('/substations/SUB-001/installations?status=active');
  assertError(res, 400, 'BAD_REQUEST');
});

test('invalid filter values return 400 naming each parameter', async () => {
  const res = await api(
    '/installations?status=broken&province_id=western&district_id=1&substation_id=S1',
  );
  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(parametersIn(res).sort(), [
    'district_id',
    'province_id',
    'status',
    'substation_id',
  ]);
});

test('a repeated parameter returns 400', async () => {
  const res = await api('/installations?status=active&status=inactive');
  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(parametersIn(res), ['status']);
});
