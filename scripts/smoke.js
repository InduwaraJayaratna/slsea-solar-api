// End-to-end smoke test against a running server. Prints PASS or FAIL per
// check, and exits with 1 if any check fails.
//
// Usage: npm run smoke -- http://localhost:3000
//
// It writes one real reading (for INST-0001), so it needs that installation's
// device key: from SMOKE_DEVICE_KEY, or else data/seed/device-keys.local.json.
// Re-run npm run seed:mongo to remove smoke readings.
const fs = require('node:fs');
const path = require('node:path');

const baseUrl = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const API = `${baseUrl}/api/v1`;
const INSTALLATION = 'INST-0001'; // in Colombo (COL), active
const DEMO_PASSWORD = 'SolarDemo#2026'; // the published demo password

function deviceKey() {
  if (process.env.SMOKE_DEVICE_KEY) return process.env.SMOKE_DEVICE_KEY;
  const file = path.join(__dirname, '..', 'data', 'seed', 'device-keys.local.json');
  const keys = JSON.parse(fs.readFileSync(file, 'utf8'));
  return keys.find((k) => k.installation_id === INSTALLATION).device_key;
}

let failures = 0;
async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}  (${error.message})`);
  }
}
function expectStatus(res, status) {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}`);
}

async function main() {
  console.log(`Smoke test against ${API}\n`);
  let token;
  let etag;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  await check('GET /health', async () => {
    const res = await fetch(`${API}/health`);
    expectStatus(res, 200);
    const body = await res.json();
    return `data_source=${body.data_source}, readings=${body.record_counts.readings}`;
  });

  await check('POST /auth/tokens as district user dist.col', async () => {
    const res = await fetch(`${API}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dist.col', password: DEMO_PASSWORD }),
    });
    expectStatus(res, 200);
    token = (await res.json()).access_token;
    return 'token received';
  });

  await check('GET /installations (narrowed to Colombo)', async () => {
    const res = await fetch(`${API}/installations`, { headers: auth() });
    expectStatus(res, 200);
    const body = await res.json();
    if (!body.data.every((i) => i.district_id === 'COL')) throw new Error('non-COL installation');
    return `${body.pagination.total} installations`;
  });

  const readingsUrl = `${API}/installations/${INSTALLATION}/readings?page=1`;
  await check(`GET /installations/${INSTALLATION}/readings page 1`, async () => {
    const res = await fetch(readingsUrl, { headers: auth() });
    expectStatus(res, 200);
    etag = res.headers.get('etag');
    const body = await res.json();
    return `${body.data.length} of ${body.pagination.total}, ETag received`;
  });

  await check('same request with If-None-Match gives 304', async () => {
    const res = await fetch(readingsUrl, { headers: { ...auth(), 'If-None-Match': etag } });
    expectStatus(res, 304);
  });

  await check('GET /districts/GAM as the Colombo user gives 403', async () => {
    const res = await fetch(`${API}/districts/GAM`, { headers: auth() });
    expectStatus(res, 403);
  });

  await check(`device ingest into ${INSTALLATION} gives 201 with Location`, async () => {
    const last = await fetch(`${API}/installations/${INSTALLATION}/last-reading`, {
      headers: auth(),
    });
    expectStatus(last, 200);
    const previous = await last.json();
    // Now, on a whole minute, with a meter total above the last one.
    const now = new Date();
    now.setUTCSeconds(0, 0);
    const res = await fetch(`${API}/installations/${INSTALLATION}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': deviceKey() },
      body: JSON.stringify({
        timestamp: now.toISOString().replace('.000Z', 'Z'),
        power_kw: 1.5,
        energy_kwh: previous.energy_kwh + 0.4,
        voltage_v: 230.5,
      }),
    });
    expectStatus(res, 201);
    const location = res.headers.get('location');
    if (!location) throw new Error('no Location header');
    const fetched = await fetch(`${baseUrl}${location}`, { headers: auth() });
    expectStatus(fetched, 200);
    return location;
  });

  await check('GET /districts/COL/generation-summary', async () => {
    const res = await fetch(`${API}/districts/COL/generation-summary`, { headers: auth() });
    expectStatus(res, 200);
    const body = await res.json();
    return `${body.installation_count} installations, ${body.reporting_count} reporting, ${body.current_power_kw} kW now`;
  });

  console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
