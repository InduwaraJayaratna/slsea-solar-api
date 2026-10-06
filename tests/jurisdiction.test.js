// Jurisdiction scoping: what each role may read.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const assertError = require('./helpers/assert-error');
const seedInstallations = require('../data/seed/installations.json');

const as = (username) => {
  const token = bearer(username);
  return (path) => request(app).get(`/api/v1${path}`).set('Authorization', token);
};
const colomboUser = as('dist.col'); // district user, Colombo (WP)
const westernUser = as('prov.wp'); // provincial user, Western Province
const nationalUser = as('national1');

const installationIn = (field, value) => seedInstallations.find((i) => i[field] === value).id;
const countWhere = (filter) => seedInstallations.filter(filter).length;

// --- District user ---------------------------------------------------------------

test('a district user can read their own district', async () => {
  const res = await colomboUser('/districts/COL');
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 'COL');
});

test('a district user gets 403 for another district', async () => {
  assertError(await colomboUser('/districts/GAM'), 403, 'FORBIDDEN'); // sibling in WP
  assertError(await colomboUser('/districts/KAN'), 403, 'FORBIDDEN'); // other province
});

test('a missing resource is 404 even when it would be outside the jurisdiction', async () => {
  assertError(await colomboUser('/districts/XXX'), 404, 'NOT_FOUND');
  assertError(await colomboUser('/installations/INST-9999'), 404, 'NOT_FOUND');
});

test("a district user can read their parent province's record but not other provinces", async () => {
  assert.equal((await colomboUser('/provinces/WP')).status, 200);
  assertError(await colomboUser('/provinces/CP'), 403, 'FORBIDDEN');
});

test('a district user sees only their parent province and their own district in lists', async () => {
  const provinces = await colomboUser('/provinces');
  assert.deepEqual(
    provinces.body.data.map((p) => p.id),
    ['WP'],
  );

  const districts = await colomboUser('/provinces/WP/districts');
  assert.deepEqual(
    districts.body.data.map((d) => d.id),
    ['COL'],
  );
});

test('a district user cannot read anything beneath a sibling district', async () => {
  const gampahaSubstation = 'SUB-004'; // first substation in GAM
  assertError(await colomboUser('/districts/GAM/substations'), 403, 'FORBIDDEN');
  assertError(await colomboUser(`/substations/${gampahaSubstation}`), 403, 'FORBIDDEN');
  assertError(
    await colomboUser(`/substations/${gampahaSubstation}/installations`),
    403,
    'FORBIDDEN',
  );
  const gampahaInstallation = installationIn('district_id', 'GAM');
  for (const suffix of ['', '/overview', '/last-reading', '/readings']) {
    assertError(
      await colomboUser(`/installations/${gampahaInstallation}${suffix}`),
      403,
      'FORBIDDEN',
    );
  }
});

test("a district user's /installations and /readings contain only their district", async () => {
  const installations = await colomboUser('/installations?page_size=200');
  assert.equal(
    installations.body.pagination.total,
    countWhere((i) => i.district_id === 'COL'),
  );
  assert.ok(installations.body.data.every((i) => i.district_id === 'COL'));

  const colombo = new Set(installations.body.data.map((i) => i.id));
  const readings = await colomboUser('/readings?page_size=200');
  assert.ok(readings.body.data.every((r) => colombo.has(r.installation_id)));
});

test('a district user filtering outside their district gets 403', async () => {
  assertError(await colomboUser('/installations?district_id=GAM'), 403, 'FORBIDDEN');
  assertError(await colomboUser('/readings?district_id=GAM'), 403, 'FORBIDDEN');
  const gampahaInstallation = installationIn('district_id', 'GAM');
  assertError(
    await colomboUser(`/readings?installation_id=${gampahaInstallation}`),
    403,
    'FORBIDDEN',
  );
  // Filtering on their own province is allowed; the result is still only COL.
  const ownProvince = await colomboUser('/installations?province_id=WP&page_size=200');
  assert.ok(ownProvince.body.data.every((i) => i.district_id === 'COL'));
});

// --- Provincial user -------------------------------------------------------------

test("a provincial user's /installations list contains only their province", async () => {
  const res = await westernUser('/installations?page_size=200');

  assert.equal(res.status, 200);
  assert.equal(
    res.body.pagination.total,
    countWhere((i) => i.province_id === 'WP'),
  );
  assert.ok(res.body.data.every((i) => i.province_id === 'WP'));
});

test('a provincial user can read every district in their province, but not other provinces', async () => {
  assert.equal((await westernUser('/districts/GAM')).status, 200);
  assert.equal((await westernUser('/provinces/WP/districts')).body.pagination.total, 3);
  assertError(await westernUser('/districts/KAN'), 403, 'FORBIDDEN');
  assertError(await westernUser('/provinces/CP/districts'), 403, 'FORBIDDEN');
  assertError(await westernUser('/installations?province_id=CP'), 403, 'FORBIDDEN');
  assertError(await westernUser('/installations?substation_id=SUB-008'), 403, 'FORBIDDEN'); // KAN
});

test('a provincial user filtering by an id that does not exist gets an empty page', async () => {
  const res = await westernUser('/installations?district_id=ZZZ');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.total, 0);
});

// --- National and admin ----------------------------------------------------------

test('a national user sees all 200 installations', async () => {
  const res = await nationalUser('/installations');
  assert.equal(res.body.pagination.total, 200);
});

test('national and admin users can read anywhere', async () => {
  for (const user of [nationalUser, as('admin')]) {
    assert.equal((await user('/districts/KAN')).status, 200);
    assert.equal((await user('/installations?province_id=CP')).status, 200);
    assert.equal((await user('/provinces')).body.pagination.total, 9);
  }
});
