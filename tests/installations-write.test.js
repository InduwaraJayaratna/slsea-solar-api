// Installation management: create, replace, patch and delete (admin only),
// with optimistic concurrency through If-Match.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./helpers/app');
const { bearer } = require('./helpers/auth');
const { newInstallationBody, createInstallation } = require('./helpers/installations');
const assertError = require('./helpers/assert-error');

const ADMIN = bearer('admin');
// A copy of `body` without `field`.
const without = (body, field) =>
  Object.fromEntries(Object.entries(body).filter(([key]) => key !== field));
const asAdmin = (method, path) =>
  request(app)[method](`/api/v1${path}`).set('Authorization', ADMIN);

// --- Create ----------------------------------------------------------------------

test('POST /substations/{id}/installations creates an installation (201, Location, key once)', async () => {
  const body = newInstallationBody();
  const res = await asAdmin('post', '/substations/SUB-001/installations').send(body);

  assert.equal(res.status, 201);
  assert.match(res.body.id, /^INST-\d{4}$/);
  assert.equal(res.headers.location, `/api/v1/installations/${res.body.id}`);
  assert.equal(res.headers['cache-control'], 'no-store');
  // Set by the server from the substation, not the client.
  assert.equal(res.body.substation_id, 'SUB-001');
  assert.equal(res.body.district_id, 'COL');
  assert.equal(res.body.province_id, 'WP');
  assert.equal(res.body.meter_id, body.meter_id);
  assert.match(res.body.device_key, /^dk_[0-9a-f]{64}$/);
  assert.equal(res.body.device_key_hash, undefined);

  // The key is shown only once: GET never returns it, but the ETag matches.
  const fetched = await request(app).get(res.headers.location).set('Authorization', ADMIN);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.device_key, undefined);
  assert.equal(fetched.headers.etag, res.headers.etag);
});

test('a duplicate meter_id or inverter_id returns 409', async () => {
  const { body: existing } = await createInstallation();
  for (const field of ['meter_id', 'inverter_id']) {
    const res = await asAdmin('post', '/substations/SUB-001/installations').send(
      newInstallationBody({ [field]: existing[field] }),
    );
    assertError(res, 409, 'CONFLICT');
    assert.equal(res.body.error.details[0].field, field);
  }
});

test('creating with missing, invalid or read-only fields returns 400', async () => {
  const missing = without(newInstallationBody(), 'site_name');
  const missingRes = await asAdmin('post', '/substations/SUB-001/installations').send(missing);
  assertError(missingRes, 400, 'BAD_REQUEST');
  assert.deepEqual(
    missingRes.body.error.details.map((d) => d.field),
    ['site_name'],
  );

  const badRes = await asAdmin('post', '/substations/SUB-001/installations').send(
    newInstallationBody({ id: 'INST-0001', capacity_kw: 0, status: 'broken' }),
  );
  assertError(badRes, 400, 'BAD_REQUEST');
  assert.deepEqual(badRes.body.error.details.map((d) => d.field).sort(), [
    'capacity_kw',
    'id',
    'status',
  ]);
});

test('creating on a substation that does not exist returns 404', async () => {
  const res = await asAdmin('post', '/substations/SUB-999/installations').send(
    newInstallationBody(),
  );
  assertError(res, 404, 'NOT_FOUND');
});

// --- Admin only ------------------------------------------------------------------

test('non-admin users get 403 on every installation write', async () => {
  const { body: installation } = await createInstallation();
  const path = `/api/v1/installations/${installation.id}`;
  for (const username of ['dist.col', 'prov.wp', 'national1']) {
    const token = bearer(username);
    const writes = [
      request(app).post('/api/v1/substations/SUB-001/installations').send(newInstallationBody()),
      request(app).put(path).send(newInstallationBody()),
      request(app).patch(path).send({ status: 'inactive' }),
      request(app).delete(path),
    ];
    for (const write of writes) {
      assertError(await write.set('Authorization', token), 403, 'FORBIDDEN');
    }
  }
});

test('a device key cannot manage installations (401)', async () => {
  const { body: installation } = await createInstallation();
  const res = await request(app)
    .patch(`/api/v1/installations/${installation.id}`)
    .set('X-Device-Key', installation.device_key)
    .send({ status: 'inactive' });
  assertError(res, 401, 'UNAUTHORIZED');
});

// --- Replace (PUT) ---------------------------------------------------------------

test('PUT replaces the editable fields and returns 200 with a new ETag', async () => {
  const created = await createInstallation();
  const replacement = newInstallationBody({ site_name: 'Renamed Site', capacity_kw: 7.5 });
  const res = await asAdmin('put', `/installations/${created.body.id}`).send(replacement);

  assert.equal(res.status, 200);
  assert.equal(res.body.site_name, 'Renamed Site');
  assert.equal(res.body.capacity_kw, 7.5);
  assert.equal(res.body.meter_id, replacement.meter_id);
  assert.equal(res.body.created_at, created.body.created_at);
  assert.notEqual(res.headers.etag, created.headers.etag);
  assert.ok(res.headers['last-modified']);
});

test('PUT is idempotent: the same request twice gives the same result', async () => {
  const { body: installation } = await createInstallation();
  const replacement = newInstallationBody({ site_name: 'Same Every Time' });

  const first = await asAdmin('put', `/installations/${installation.id}`).send(replacement);
  const second = await asAdmin('put', `/installations/${installation.id}`).send(replacement);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(second.headers.etag, first.headers.etag);
});

test('PUT with a missing field returns 400 naming it', async () => {
  const { body: installation } = await createInstallation();
  const incomplete = without(newInstallationBody(), 'capacity_kw');
  const res = await asAdmin('put', `/installations/${installation.id}`).send(incomplete);

  assertError(res, 400, 'BAD_REQUEST');
  assert.deepEqual(
    res.body.error.details.map((d) => d.field),
    ['capacity_kw'],
  );
});

test("PUT taking another installation's meter_id returns 409", async () => {
  const { body: first } = await createInstallation();
  const { body: second } = await createInstallation();
  const res = await asAdmin('put', `/installations/${second.id}`).send(
    newInstallationBody({ meter_id: first.meter_id }),
  );
  assertError(res, 409, 'CONFLICT');
});

// --- Partial update (PATCH) ------------------------------------------------------

test('PATCH changes only the fields sent', async () => {
  const { body: installation } = await createInstallation();
  const res = await asAdmin('patch', `/installations/${installation.id}`).send({
    status: 'inactive',
    capacity_kw: 9,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'inactive');
  assert.equal(res.body.capacity_kw, 9);
  assert.equal(res.body.site_name, installation.site_name);
});

test('PATCH with read-only, unknown or no fields returns 400', async () => {
  const { body: installation } = await createInstallation();
  const path = `/installations/${installation.id}`;

  for (const field of ['id', 'substation_id', 'district_id', 'province_id', 'created_at']) {
    const res = await asAdmin('patch', path).send({ [field]: 'X' });
    assertError(res, 400, 'BAD_REQUEST');
    assert.equal(res.body.error.details[0].message, 'is read-only and cannot be set');
  }
  assertError(await asAdmin('patch', path).send({ colour: 'blue' }), 400, 'BAD_REQUEST');
  assertError(await asAdmin('patch', path).send({}), 400, 'BAD_REQUEST');
});

// --- Optimistic concurrency ------------------------------------------------------

test('a write with a stale If-Match returns 412 and changes nothing', async () => {
  const created = await createInstallation();
  const path = `/installations/${created.body.id}`;
  const etag = created.headers.etag;

  const first = await asAdmin('patch', path).set('If-Match', etag).send({ status: 'maintenance' });
  assert.equal(first.status, 200);

  // A second client still holding the old ETag.
  const stale = await asAdmin('patch', path).set('If-Match', etag).send({ status: 'inactive' });
  assertError(stale, 412, 'PRECONDITION_FAILED');
  const staleDelete = await asAdmin('delete', path).set('If-Match', etag);
  assertError(staleDelete, 412, 'PRECONDITION_FAILED');

  const current = await asAdmin('get', path);
  assert.equal(current.body.status, 'maintenance');

  // With the current ETag the write goes through.
  const fresh = await asAdmin('patch', path)
    .set('If-Match', first.headers.etag)
    .send({ status: 'inactive' });
  assert.equal(fresh.status, 200);
});

test('a weak ETag never satisfies If-Match', async () => {
  const created = await createInstallation();
  const res = await asAdmin('patch', `/installations/${created.body.id}`)
    .set('If-Match', `W/${created.headers.etag}`)
    .send({ status: 'inactive' });
  assertError(res, 412, 'PRECONDITION_FAILED');
});

// --- Delete ----------------------------------------------------------------------

test('DELETE returns 204, and repeating it returns 404', async () => {
  const created = await createInstallation();
  const path = `/installations/${created.body.id}`;

  const res = await asAdmin('delete', path).set('If-Match', created.headers.etag);
  assert.equal(res.status, 204);
  assert.equal(res.text, '');

  assertError(await asAdmin('delete', path), 404, 'NOT_FOUND');
  assertError(await asAdmin('get', path), 404, 'NOT_FOUND');
});

test('DELETE of an installation with readings returns 409 and suggests inactive', async () => {
  const res = await asAdmin('delete', '/installations/INST-0001');
  assertError(res, 409, 'INSTALLATION_HAS_READINGS');
  assert.match(res.body.error.message, /inactive/);
  assert.equal((await asAdmin('get', '/installations/INST-0001')).status, 200);
});
