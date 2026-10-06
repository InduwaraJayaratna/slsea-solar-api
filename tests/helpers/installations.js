// Creates installations through the API for write tests. Each one gets unique
// meter and inverter ids, and the response includes its plaintext device key.
const request = require('supertest');
const app = require('./app');
const { bearer } = require('./auth');

let counter = 0;

function newInstallationBody(overrides = {}) {
  counter += 1;
  return {
    meter_id: `MTR-TEST-${counter}`,
    inverter_id: `INV-TEST-${counter}`,
    site_name: `Test Site ${counter}`,
    address: 'No. 1, Main Street, Kolonnawa',
    capacity_kw: 5,
    panel_count: 12,
    status: 'active',
    commissioned_at: '2026-01-01T00:00:00Z',
    latitude: 6.9,
    longitude: 79.9,
    ...overrides,
  };
}

// Returns the 201 response; body has the installation plus device_key.
async function createInstallation(overrides = {}, substationId = 'SUB-001') {
  const res = await request(app)
    .post(`/api/v1/substations/${substationId}/installations`)
    .set('Authorization', bearer('admin'))
    .send(newInstallationBody(overrides));
  if (res.status !== 201) throw new Error(`Create failed: ${res.status} ${res.text}`);
  return res;
}

module.exports = { newInstallationBody, createInstallation };
