// The memory repositories: async interface, lookups and the readings index.
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/test-env');
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

test('readings.findMany returns one page and the total, in either order', async () => {
  const filter = { installation_ids: ['INST-0001'] };
  const oldest = await repositories.readings.findMany(filter, { sort: 'timestamp', limit: 3 });
  const newest = await repositories.readings.findMany(filter, { sort: '-timestamp', limit: 3 });

  assert.equal(oldest.total, 672);
  assert.equal(oldest.items.length, 3);
  assert.ok(oldest.items[0].timestamp < oldest.items[1].timestamp);
  assert.ok(newest.items[0].timestamp > newest.items[1].timestamp);
  assert.ok(oldest.items.every((r) => r.installation_id === 'INST-0001'));
});

test('readings.findMany applies a [from, to) window', async () => {
  const { items, total } = await repositories.readings.findMany(
    { installation_ids: ['INST-0001'], from: '2026-10-01T00:00:00Z', to: '2026-10-01T01:00:00Z' },
    { sort: 'timestamp' },
  );
  assert.equal(total, 4); // 00:00, 00:15, 00:30, 00:45; 01:00 is excluded
  assert.equal(items[0].timestamp, '2026-10-01T00:00:00Z');
});

test('readings.findMany with no installations matches nothing', async () => {
  const result = await repositories.readings.findMany({ installation_ids: [] });
  assert.deepEqual(result, { items: [], total: 0 });
});
