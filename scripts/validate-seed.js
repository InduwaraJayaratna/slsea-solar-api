// Checks the seed data in data/seed/: scale, unique ids, foreign keys and meter
// totals. Run directly (exit code 1 on failure) or call validateSeed() from tests.
//
// Usage: node scripts/validate-seed.js
const fs = require('node:fs');
const path = require('node:path');

const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');
const COLLECTIONS = ['provinces', 'districts', 'substations', 'installations', 'readings', 'users'];

// Scale required by the brief.
const EXACT_COUNTS = { provinces: 9, districts: 25 };
const MIN_COUNTS = { substations: 20, installations: 200 };
const MIN_DAYS = 7;

const SLOT_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadSeed(dir = SEED_DIR) {
  const seed = {};
  for (const name of COLLECTIONS) {
    seed[name] = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  }
  return seed;
}

function checkUnique(records, field, label, errors) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record[field])) errors.push(`${label}: duplicate ${field} "${record[field]}"`);
    seen.add(record[field]);
  }
}

// Every value of `field` must be an id in `targetIds` (or null, if allowed).
function checkReference(records, field, targetIds, label, errors, { nullable = false } = {}) {
  for (const record of records) {
    const value = record[field];
    if (value === null && nullable) continue;
    if (!targetIds.has(value)) {
      errors.push(`${label} ${record.id}: ${field} "${value}" does not resolve`);
    }
  }
}

function checkScale(seed, errors) {
  for (const [name, expected] of Object.entries(EXACT_COUNTS)) {
    if (seed[name].length !== expected) {
      errors.push(`${name}: expected ${expected} records, found ${seed[name].length}`);
    }
  }
  for (const [name, minimum] of Object.entries(MIN_COUNTS)) {
    if (seed[name].length < minimum) {
      errors.push(`${name}: expected at least ${minimum} records, found ${seed[name].length}`);
    }
  }
}

function checkReferences(seed, errors) {
  const idsOf = (name) => new Set(seed[name].map((record) => record.id));
  const provinceIds = idsOf('provinces');
  const districtIds = idsOf('districts');

  checkReference(seed.districts, 'province_id', provinceIds, 'district', errors);
  checkReference(seed.substations, 'district_id', districtIds, 'substation', errors);
  checkReference(seed.installations, 'substation_id', idsOf('substations'), 'installation', errors);
  checkReference(seed.installations, 'district_id', districtIds, 'installation', errors);
  checkReference(seed.installations, 'province_id', provinceIds, 'installation', errors);
  checkReference(seed.readings, 'installation_id', idsOf('installations'), 'reading', errors);
  checkReference(seed.users, 'province_id', provinceIds, 'user', errors, { nullable: true });
  checkReference(seed.users, 'district_id', districtIds, 'user', errors, { nullable: true });

  // The denormalised district_id and province_id copies must agree with the
  // substation -> district -> province chain they were copied from.
  const districtOfSubstation = new Map(seed.substations.map((s) => [s.id, s.district_id]));
  const provinceOfDistrict = new Map(seed.districts.map((d) => [d.id, d.province_id]));
  for (const installation of seed.installations) {
    const districtId = districtOfSubstation.get(installation.substation_id);
    if (installation.district_id !== districtId) {
      errors.push(`installation ${installation.id}: district_id does not match its substation`);
    }
    if (installation.province_id !== provinceOfDistrict.get(districtId)) {
      errors.push(`installation ${installation.id}: province_id does not match its district`);
    }
  }

  // Each role must carry exactly the jurisdiction it needs.
  for (const user of seed.users) {
    const needsProvince = user.role === 'provincial' || user.role === 'district';
    const needsDistrict = user.role === 'district';
    if (needsProvince !== (user.province_id !== null)) {
      errors.push(`user ${user.id}: role ${user.role} has the wrong province_id`);
    }
    if (needsDistrict !== (user.district_id !== null)) {
      errors.push(`user ${user.id}: role ${user.role} has the wrong district_id`);
    }
    if (needsDistrict && user.province_id !== provinceOfDistrict.get(user.district_id)) {
      errors.push(`user ${user.id}: province_id does not match its district`);
    }
  }
}

function checkReadings(seed, errors) {
  const byInstallation = new Map(seed.installations.map((i) => [i.id, []]));
  for (const reading of seed.readings) byInstallation.get(reading.installation_id)?.push(reading);

  if (seed.readings.length === 0) {
    errors.push('readings: no readings');
    return;
  }
  // reduce rather than Math.min(...times): spreading 130k values overflows the stack.
  const times = seed.readings.map((reading) => Date.parse(reading.timestamp));
  const firstMs = times.reduce((a, b) => Math.min(a, b));
  const lastMs = times.reduce((a, b) => Math.max(a, b));
  const slotsInWindow = (lastMs - firstMs) / SLOT_MS + 1;
  if (slotsInWindow * SLOT_MS < MIN_DAYS * DAY_MS) {
    errors.push(`readings: window covers less than ${MIN_DAYS} days`);
  }

  for (const installation of seed.installations) {
    const readings = byInstallation.get(installation.id);
    // Active installations must report in every 15-minute slot of the window.
    // Inactive or maintenance ones are allowed a gap, but must have some data.
    if (installation.status === 'active' && readings.length !== slotsInWindow) {
      errors.push(
        `installation ${installation.id}: ${readings.length} readings, expected ${slotsInWindow}`,
      );
    } else if (readings.length === 0) {
      errors.push(`installation ${installation.id}: has no readings`);
    }

    readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (let i = 1; i < readings.length; i++) {
      if (readings[i].energy_kwh < readings[i - 1].energy_kwh) {
        errors.push(`reading ${readings[i].id}: energy_kwh decreased`);
      }
    }
  }
}

function validateSeed(seed) {
  const errors = [];
  checkScale(seed, errors);
  for (const name of COLLECTIONS) checkUnique(seed[name], 'id', name, errors);
  checkUnique(seed.installations, 'meter_id', 'installations', errors);
  checkUnique(seed.installations, 'inverter_id', 'installations', errors);
  checkUnique(seed.users, 'username', 'users', errors);
  checkReferences(seed, errors);
  checkReadings(seed, errors);
  return errors;
}

if (require.main === module) {
  const seed = loadSeed();
  for (const name of COLLECTIONS) console.log(`  ${name.padEnd(14)} ${seed[name].length}`);
  const errors = validateSeed(seed);
  if (errors.length > 0) {
    // One bad rule can produce thousands of errors; the first 20 are enough.
    for (const error of errors.slice(0, 20)) console.error(`  - ${error}`);
    console.error(`Seed data invalid: ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log('Seed data valid');
}

module.exports = { loadSeed, validateSeed };
