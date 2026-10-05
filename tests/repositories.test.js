// The memory repositories: async interface, lookups and the readings index.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const repositories = require('../src/repositories');

test('repository methods return Promises', () => {
  assert.ok(repositories.provinces.findById('WP') instanceof Promise);
  assert.ok(repositories.readings.count() instanceof Promise);
});

test('findById returns the record, or null when it does not exist', async () => {
  assert.deepEqual(await repositories.provinces.findById('WP'), { id: 'WP', name: 'Western' });
  assert.equal(await repositories.provinces.findById('XX'), null);
});

test('returned records are copies, so changing one does not change the store', async () => {
  const province = await repositories.provinces.findById('WP');
  province.name = 'Changed';
  assert.equal((await repositories.provinces.findById('WP')).name, 'Western');
});

test("findByInstallationId returns one installation's readings, oldest first", async () => {
  const readings = await repositories.readings.findByInstallationId('INST-0001');

  assert.equal(readings.length, 672);
  assert.ok(readings.every((r) => r.installation_id === 'INST-0001'));
  for (let i = 1; i < readings.length; i++) {
    assert.ok(readings[i - 1].timestamp < readings[i].timestamp);
  }
  assert.deepEqual(await repositories.readings.findByInstallationId('INST-9999'), []);
});
