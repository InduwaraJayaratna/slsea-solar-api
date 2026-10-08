// The documentation cannot drift from the code: every Express route must be in
// docs/openapi.yaml and every documented operation must exist in Express, with
// the same authentication. Also checks the Swagger UI page is served.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const request = require('supertest');
const app = require('./helpers/app');
const { MOUNTS } = require('../src/routes');

const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Every route Express serves under /api/v1, as "GET /installations/{installation_id}",
// with the authentication middleware it runs.
function expressOperations() {
  const operations = new Map();
  for (const [mountPath, router] of MOUNTS) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      // "/:installation_id/readings" -> "/installations/{installation_id}/readings"
      const routePath = layer.route.path === '/' ? '' : layer.route.path;
      const fullPath = (mountPath + routePath).replace(/:(\w+)/g, '{$1}');
      for (const handler of layer.route.stack) {
        if (!METHODS.includes(handler.method)) continue; // .all() (405) and HEAD
        const key = `${handler.method.toUpperCase()} ${fullPath}`;
        const names = layer.route.stack
          .filter((h) => h.method === handler.method)
          .map((h) => h.handle.name);
        operations.set(key, names);
      }
    }
  }
  return operations;
}

// Every operation in the spec, with its security scheme name (or "none").
function specOperations() {
  const operations = new Map();
  for (const [specPath, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      if (!item[method]) continue;
      const security = item[method].security ?? spec.security ?? [];
      const scheme = security.length > 0 ? Object.keys(security[0])[0] : 'none';
      operations.set(`${method.toUpperCase()} ${specPath}`, scheme);
    }
  }
  return operations;
}

test('every Express route is documented in docs/openapi.yaml', () => {
  const documented = specOperations();
  const missing = [...expressOperations().keys()].filter((op) => !documented.has(op));
  assert.deepEqual(missing, [], 'routes missing from the spec');
});

test('every documented operation exists in Express', () => {
  const served = expressOperations();
  const extra = [...specOperations().keys()].filter((op) => !served.has(op));
  assert.deepEqual(extra, [], 'operations in the spec that Express does not serve');
});

test('each operation documents the authentication its route actually uses', () => {
  const documented = specOperations();
  for (const [operation, handlers] of expressOperations()) {
    let expected = 'none';
    if (handlers.includes('authenticateUser')) expected = 'bearerAuth';
    if (handlers.includes('authenticateDevice')) expected = 'deviceKey';
    assert.equal(documented.get(operation), expected, operation);
  }
});

test('the spec uses the relative server URL /api/v1', () => {
  assert.deepEqual(
    spec.servers.map((server) => server.url),
    ['/api/v1'],
  );
});

test('GET /api-docs/openapi.json returns the spec', async () => {
  const res = await request(app).get('/api-docs/openapi.json');
  assert.equal(res.status, 200);
  assert.equal(res.body.openapi, '3.0.3');
  assert.deepEqual(Object.keys(res.body.paths), Object.keys(spec.paths));
});

test('GET /api-docs serves Swagger UI with a CSP relaxed only for the docs', async () => {
  const page = await request(app).get('/api-docs/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /swagger-ui/);
  const docsCsp = page.headers['content-security-policy'];
  assert.match(docsCsp, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(docsCsp, /upgrade-insecure-requests/);

  // The API itself keeps helmet's default, stricter policy.
  const api = await request(app).get('/api/v1/health');
  assert.match(api.headers['content-security-policy'], /upgrade-insecure-requests/);
});

test('GET / redirects to /api-docs', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/api-docs');
});
