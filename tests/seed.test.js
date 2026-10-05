// Runs the seed validator against the committed seed data, and checks that it
// catches broken data (so a passing run means something).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSeed, validateSeed } = require('../scripts/validate-seed');

const seed = loadSeed();

test('committed seed data is valid', () => {
  assert.deepEqual(validateSeed(seed), []);
});

test('validator reports a foreign key that does not resolve', () => {
  const districts = seed.districts.map((d, i) => (i === 0 ? { ...d, province_id: 'XX' } : d));
  const errors = validateSeed({ ...seed, districts });
  assert.ok(errors.some((e) => e.includes('province_id "XX" does not resolve')));
});

test('validator reports a meter total that decreases', () => {
  const readings = seed.readings.map((r, i) => (i === 50 ? { ...r, energy_kwh: 0 } : r));
  const errors = validateSeed({ ...seed, readings });
  assert.ok(errors.some((e) => e.includes('energy_kwh decreased')));
});

test('validator reports too few installations', () => {
  const errors = validateSeed({ ...seed, installations: seed.installations.slice(0, 10) });
  assert.ok(errors.some((e) => e.startsWith('installations: expected at least 200')));
});
