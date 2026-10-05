// Generates deterministic seed data into data/seed/, one flat JSON array per collection.
//
// Usage: node scripts/generate-seed.js [--end=<ISO date>] [--days=7]
//   --end   last reading time (default: now). Rounded down to a 15-minute slot.
//   --days  how many days of 15-minute readings to generate per installation.
//
// The same arguments always produce identical files, because every random choice
// comes from one seeded generator instead of Math.random().
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');
const CREDENTIALS_DOC = path.join(__dirname, '..', 'docs', 'demo-credentials.md');

// Demo only: every seed user shares this password. It is published in
// docs/demo-credentials.md, so it must never be used outside seed data.
const DEMO_PASSWORD = 'SolarDemo#2026';
const BCRYPT_COST = 10;

const SLOT_MINUTES = 15;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
const DAY_MS = 24 * 60 * 60 * 1000;

// Sri Lanka time is UTC+05:30 all year (no daylight saving).
const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
// Local solar day used for the generation curve (hours, Sri Lanka time).
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 18.5;

// --- Seeded random numbers -------------------------------------------------

// mulberry32: a small, well-known seeded pseudo-random generator returning [0, 1).
function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20261006);
const between = (min, max) => min + random() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const round = (value, decimals) => Number(value.toFixed(decimals));

function weightedPick(items, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = random() * total;
  for (let i = 0; i < items.length; i++) {
    remaining -= weights[i];
    if (remaining < 0) return items[i];
  }
  return items[items.length - 1];
}

// ISO 8601 UTC without milliseconds, e.g. 2026-10-05T06:15:00Z.
const toIso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

// --- Reference data ----------------------------------------------------------

const PROVINCES = [
  { id: 'WP', name: 'Western' },
  { id: 'CP', name: 'Central' },
  { id: 'SP', name: 'Southern' },
  { id: 'NP', name: 'Northern' },
  { id: 'EP', name: 'Eastern' },
  { id: 'NW', name: 'North Western' },
  { id: 'NC', name: 'North Central' },
  { id: 'UV', name: 'Uva' },
  { id: 'SG', name: 'Sabaragamuwa' },
];

// The 25 districts. lat/lon is a point inside the district and spread is how far
// (in degrees) coordinates may wander from it; small for compact or coastal
// districts so points stay on land. weight is a rough share of rooftop solar,
// used to give populous districts more installations. towns become substation
// names, so populous districts get more than one substation.
// prettier-ignore
const DISTRICTS = [
  { id: 'COL', name: 'Colombo', province_id: 'WP', lat: 6.87, lon: 79.93, spread: 0.03, weight: 12, towns: ['Kolonnawa', 'Dehiwala', 'Maharagama'] },
  { id: 'GAM', name: 'Gampaha', province_id: 'WP', lat: 7.09, lon: 80, spread: 0.06, weight: 10, towns: ['Biyagama', 'Kotugoda'] },
  { id: 'KAL', name: 'Kalutara', province_id: 'WP', lat: 6.6, lon: 80.1, spread: 0.06, weight: 6, towns: ['Panadura'] },
  { id: 'KAN', name: 'Kandy', province_id: 'CP', lat: 7.29, lon: 80.63, spread: 0.06, weight: 6, towns: ['Kiribathkumbura', 'Pallekele'] },
  { id: 'MTL', name: 'Matale', province_id: 'CP', lat: 7.6, lon: 80.65, spread: 0.06, weight: 2, towns: ['Ukuwela'] },
  { id: 'NUW', name: 'Nuwara Eliya', province_id: 'CP', lat: 6.97, lon: 80.77, spread: 0.05, weight: 2, towns: ['Nuwara Eliya'] },
  { id: 'GAL', name: 'Galle', province_id: 'SP', lat: 6.2, lon: 80.3, spread: 0.05, weight: 5, towns: ['Galle'] },
  { id: 'MTR', name: 'Matara', province_id: 'SP', lat: 6.1, lon: 80.55, spread: 0.04, weight: 4, towns: ['Matara'] },
  { id: 'HAM', name: 'Hambantota', province_id: 'SP', lat: 6.25, lon: 81, spread: 0.06, weight: 3, towns: ['Hambantota'] },
  { id: 'JAF', name: 'Jaffna', province_id: 'NP', lat: 9.7, lon: 80.05, spread: 0.03, weight: 3, towns: ['Chunnakam'] },
  { id: 'KIL', name: 'Kilinochchi', province_id: 'NP', lat: 9.38, lon: 80.4, spread: 0.05, weight: 1, towns: ['Kilinochchi'] },
  { id: 'MAN', name: 'Mannar', province_id: 'NP', lat: 8.85, lon: 80.05, spread: 0.05, weight: 1, towns: ['Mannar'] },
  { id: 'VAV', name: 'Vavuniya', province_id: 'NP', lat: 8.75, lon: 80.5, spread: 0.06, weight: 1, towns: ['Vavuniya'] },
  { id: 'MUL', name: 'Mullaitivu', province_id: 'NP', lat: 9.15, lon: 80.65, spread: 0.06, weight: 1, towns: ['Mullaitivu'] },
  { id: 'BAT', name: 'Batticaloa', province_id: 'EP', lat: 7.7, lon: 81.6, spread: 0.04, weight: 2, towns: ['Valaichchenai'] },
  { id: 'AMP', name: 'Ampara', province_id: 'EP', lat: 7.28, lon: 81.6, spread: 0.06, weight: 3, towns: ['Ampara'] },
  { id: 'TRI', name: 'Trincomalee', province_id: 'EP', lat: 8.5, lon: 81.1, spread: 0.06, weight: 2, towns: ['Trincomalee'] },
  { id: 'KUR', name: 'Kurunegala', province_id: 'NW', lat: 7.6, lon: 80.3, spread: 0.08, weight: 7, towns: ['Kurunegala', 'Maho'] },
  { id: 'PUT', name: 'Puttalam', province_id: 'NW', lat: 7.95, lon: 79.92, spread: 0.05, weight: 3, towns: ['Puttalam'] },
  { id: 'ANU', name: 'Anuradhapura', province_id: 'NC', lat: 8.3, lon: 80.45, spread: 0.08, weight: 4, towns: ['Anuradhapura'] },
  { id: 'POL', name: 'Polonnaruwa', province_id: 'NC', lat: 7.95, lon: 81.05, spread: 0.06, weight: 2, towns: ['Polonnaruwa'] },
  { id: 'BAD', name: 'Badulla', province_id: 'UV', lat: 7, lon: 81.05, spread: 0.06, weight: 2, towns: ['Badulla'] },
  { id: 'MON', name: 'Monaragala', province_id: 'UV', lat: 6.8, lon: 81.3, spread: 0.08, weight: 1, towns: ['Monaragala'] },
  { id: 'RAT', name: 'Ratnapura', province_id: 'SG', lat: 6.68, lon: 80.4, spread: 0.06, weight: 4, towns: ['Balangoda'] },
  { id: 'KEG', name: 'Kegalle', province_id: 'SG', lat: 7.25, lon: 80.35, spread: 0.05, weight: 3, towns: ['Kegalle'] },
];

const SURNAMES = [
  'Perera',
  'Fernando',
  'Silva',
  'Jayasinghe',
  'Bandara',
  'Wickramasinghe',
  'Rajapaksha',
  'Dissanayake',
  'Kumara',
  'Herath',
  'Gunawardena',
  'Senanayake',
  'Ratnayake',
  'Sivakumar',
  'Navaratnam',
  'Mohamed',
  'Ismail',
  'Rodrigo',
];
const FIRST_NAMES = [
  'Nimal',
  'Kamala',
  'Sunil',
  'Chamari',
  'Ruwan',
  'Dilani',
  'Kasun',
  'Tharushi',
  'Pradeep',
  'Ishara',
  'Suresh',
  'Priya',
  'Fathima',
  'Ahamed',
  'Malini',
  'Dinesh',
];
const BUSINESS_TYPES = [
  'Hardware',
  'Textiles',
  'Bakery',
  'Pharmacy',
  'Super Centre',
  'Guest House',
  'Rice Mill',
  'Motors',
  'Bookshop',
];
const ROADS = [
  'Temple Road',
  'Station Road',
  'Main Street',
  'Lake Road',
  'School Lane',
  'Hospital Road',
  'Church Road',
  'Market Road',
  'Hill Street',
  'Park Avenue',
];

// --- Builders ----------------------------------------------------------------

// Returns the substations plus each one's town, which installation addresses use.
function buildSubstations() {
  const substations = [];
  const townBySubstation = new Map();
  for (const district of DISTRICTS) {
    for (const town of district.towns) {
      const id = `SUB-${String(substations.length + 1).padStart(3, '0')}`;
      townBySubstation.set(id, town);
      substations.push({
        id,
        name: `${town} Grid Substation`,
        district_id: district.id,
        voltage_kv: random() < 0.2 ? 220 : 132,
        capacity_mva: pick([31.5, 63, 90, 126]),
        latitude: round(district.lat + between(-district.spread, district.spread), 5),
        longitude: round(district.lon + between(-district.spread, district.spread), 5),
      });
    }
  }
  return { substations, townBySubstation };
}

function uniqueCode(prefix, digits, used) {
  let code;
  do {
    code = prefix + String(intBetween(0, 10 ** digits - 1)).padStart(digits, '0');
  } while (used.has(code));
  used.add(code);
  return code;
}

// A 32-byte key as hex. It comes from the seeded generator so the seed stays
// reproducible; that makes these keys predictable, which is acceptable only
// because they are demo keys. Real registration must use crypto.randomBytes.
function generateDeviceKey() {
  const bytes = Array.from({ length: 32 }, () => intBetween(0, 255).toString(16).padStart(2, '0'));
  return `dk_${bytes.join('')}`;
}

function buildInstallations(substations, townBySubstation, endMs, days) {
  const districtsById = new Map(DISTRICTS.map((d) => [d.id, d]));

  // Every substation gets one installation; the rest are shared out by district
  // weight, split evenly between that district's substations.
  const weights = substations.map((s) => {
    const district = districtsById.get(s.district_id);
    return district.weight / district.towns.length;
  });
  const assigned = [...substations];
  while (assigned.length < 200) assigned.push(weightedPick(substations, weights));
  // Group by substation so installation ids run in substation order.
  assigned.sort((a, b) => a.id.localeCompare(b.id));

  const slots = days * SLOTS_PER_DAY;
  const firstSlotMs = endMs - (slots - 1) * SLOT_MS;
  const usedMeters = new Set();
  const usedInverters = new Set();
  const installations = [];
  const deviceKeys = [];
  // Slot index from which a non-active installation stops reporting.
  const offlineFrom = new Map();

  assigned.forEach((substation, index) => {
    const district = districtsById.get(substation.district_id);
    const id = `INST-${String(index + 1).padStart(4, '0')}`;
    const capacityKw = Math.round(between(2, 20) * 2) / 2; // nearest 0.5 kW
    const panelWatts = pick([400, 450, 550]);
    const status = random() < 0.95 ? 'active' : pick(['inactive', 'maintenance']);

    // Commissioned at least 30 days before the reading window, on the hour.
    const latestCommission = firstSlotMs - 30 * DAY_MS;
    const commissionedMs =
      Math.floor(between(Date.UTC(2016, 0, 1), latestCommission) / 3600000) * 3600000;
    const createdMs = commissionedMs + intBetween(0, 14) * DAY_MS;

    let updatedMs;
    if (status === 'active') {
      updatedMs = Math.floor(between(createdMs, endMs) / 60000) * 60000;
    } else {
      // A non-active installation stops reporting part-way through the window,
      // and its status changed at that moment.
      const stopSlot = intBetween(Math.floor(slots * 0.4), Math.floor(slots * 0.9));
      offlineFrom.set(id, stopSlot);
      updatedMs = firstSlotMs + stopSlot * SLOT_MS;
    }

    const isHome = random() < 0.75;
    const surname = pick(SURNAMES);
    const deviceKey = generateDeviceKey();
    deviceKeys.push({ installation_id: id, device_key: deviceKey });

    // Installations sit close to their substation (within half the district spread).
    const nearby = district.spread / 2;
    installations.push({
      id,
      substation_id: substation.id,
      district_id: district.id,
      province_id: district.province_id,
      meter_id: uniqueCode('MTR-', 8, usedMeters),
      inverter_id: uniqueCode('INV-', 9, usedInverters),
      site_name: isHome ? `${surname} Residence` : `${surname} ${pick(BUSINESS_TYPES)}`,
      address: `No. ${intBetween(1, 250)}, ${pick(ROADS)}, ${townBySubstation.get(substation.id)}`,
      capacity_kw: capacityKw,
      panel_count: Math.ceil((capacityKw * 1000) / panelWatts),
      status,
      commissioned_at: toIso(commissionedMs),
      latitude: round(substation.latitude + between(-nearby, nearby), 5),
      longitude: round(substation.longitude + between(-nearby, nearby), 5),
      device_key_hash: crypto.createHash('sha256').update(deviceKey).digest('hex'),
      created_at: toIso(createdMs),
      updated_at: toIso(updatedMs),
    });
  });

  return { installations, deviceKeys, offlineFrom };
}

function buildUsers() {
  const users = [];
  // bcrypt normally makes a random salt. Building the salt from the seeded
  // generator keeps users.json identical between runs; each user still gets a
  // different salt, so equal passwords still give different hashes.
  const saltAlphabet = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const addUser = (username, role, provinceId, districtId) => {
    const salt = `$2b$${BCRYPT_COST}$${Array.from({ length: 22 }, () => pick(saltAlphabet)).join('')}`;
    users.push({
      id: `USR-${String(users.length + 1).padStart(3, '0')}`,
      username,
      full_name: `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`,
      role,
      province_id: provinceId,
      district_id: districtId,
      password_hash: bcrypt.hashSync(DEMO_PASSWORD, salt),
    });
  };

  addUser('admin', 'admin', null, null);
  addUser('national1', 'national', null, null);
  addUser('national2', 'national', null, null);
  for (const province of PROVINCES) {
    addUser(`prov.${province.id.toLowerCase()}`, 'provincial', province.id, null);
  }
  // District users also carry their province, the same denormalisation as
  // installations, so a jurisdiction check never needs a district lookup.
  for (const district of DISTRICTS) {
    addUser(`dist.${district.id.toLowerCase()}`, 'district', district.province_id, district.id);
  }
  return users;
}

// Power in kW at one moment. Follows a sine curve from sunrise to sunset in Sri
// Lanka time, peaking around 12:15, scaled by the installation's performance,
// the day's cloud cover, the odd passing cloud and a little noise.
function solarPowerKw(capacityKw, performance, dayCloud, timeMs) {
  const local = new Date(timeMs + SRI_LANKA_OFFSET_MS);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  if (hour <= SUNRISE_HOUR || hour >= SUNSET_HOUR) return 0;

  const sun = Math.sin((Math.PI * (hour - SUNRISE_HOUR)) / (SUNSET_HOUR - SUNRISE_HOUR));
  const passingCloud = random() < 0.08 ? between(0.4, 0.8) : 1;
  const noise = between(0.97, 1.03);
  return Math.min(capacityKw, capacityKw * performance * sun * dayCloud * passingCloud * noise);
}

// Builds readings as JSON strings (one per line in the output file).
function buildReadings(installations, offlineFrom, endMs, days) {
  const slots = days * SLOTS_PER_DAY;
  const firstSlotMs = endMs - (slots - 1) * SLOT_MS;
  // Weather is shared by a district on a given local day: most days are clear,
  // some are overcast.
  const cloudByDistrictDay = new Map();
  const dayCloud = (districtId, timeMs) => {
    const localDay = new Date(timeMs + SRI_LANKA_OFFSET_MS).toISOString().slice(0, 10);
    const key = `${districtId}|${localDay}`;
    if (!cloudByDistrictDay.has(key)) {
      cloudByDistrictDay.set(key, random() < 0.6 ? between(0.9, 1) : between(0.45, 0.9));
    }
    return cloudByDistrictDay.get(key);
  };

  const lines = [];
  for (const installation of installations) {
    const performance = between(0.82, 0.92);
    // The meter total at the start of the window: about 3.4-4.2 kWh per kW of
    // capacity per day since commissioning (typical for Sri Lanka).
    const daysRunning = Math.max(
      0,
      (firstSlotMs - Date.parse(installation.commissioned_at)) / DAY_MS,
    );
    let energyKwh = daysRunning * installation.capacity_kw * between(3.4, 4.2);
    const lastSlot = offlineFrom.get(installation.id) ?? slots;

    for (let slot = 0; slot < lastSlot; slot++) {
      const timeMs = firstSlotMs + slot * SLOT_MS;
      const powerKw = solarPowerKw(
        installation.capacity_kw,
        performance,
        dayCloud(installation.district_id, timeMs),
        timeMs,
      );
      // Energy only ever adds non-negative amounts, so the total never decreases.
      energyKwh += powerKw * (SLOT_MINUTES / 60);
      const timestamp = toIso(timeMs);
      // Compact UTC time for the id: 2026-10-05T06:15:00Z -> 20261005T0615Z.
      const compact = `${timestamp.slice(0, 4)}${timestamp.slice(5, 7)}${timestamp.slice(8, 13)}${timestamp.slice(14, 16)}Z`;
      lines.push(
        JSON.stringify({
          id: `${installation.id}-${compact}`,
          installation_id: installation.id,
          timestamp,
          power_kw: round(powerKw, 3),
          energy_kwh: round(energyKwh, 3),
          // Grid voltage around 230 V, nudged up slightly while exporting.
          voltage_v: round(230 + between(-4, 4) + 4 * (powerKw / installation.capacity_kw), 1),
        }),
      );
    }
  }
  return lines;
}

// --- Output ------------------------------------------------------------------

function writeCredentialsDoc(users, deviceKeys) {
  const userRows = users
    .map((u) => `| ${u.username} | ${u.role} | ${u.province_id ?? '-'} | ${u.district_id ?? '-'} |`)
    .join('\n');
  const keyRows = deviceKeys
    .slice(0, 3)
    .map((k) => `| ${k.installation_id} | \`${k.device_key}\` |`)
    .join('\n');

  const doc = `# Demo credentials

> **SEED / DEMO DATA ONLY.** These logins and keys exist only in the generated seed
> data. They are public on purpose so the API can be demonstrated. Never reuse them
> in a real deployment.

This file is generated by \`npm run seed:generate\`. Do not edit it by hand.

## Users

All seed users share one password: \`${DEMO_PASSWORD}\`

| username | role | province_id | district_id |
| --- | --- | --- | --- |
${userRows}

## Device keys

Plaintext keys for the first 3 installations. Only SHA-256 hashes are stored in
\`data/seed/installations.json\`. The keys for all installations are written to
\`data/seed/device-keys.local.json\`, which is git-ignored.

| installation_id | device_key |
| --- | --- |
${keyRows}
`;
  fs.writeFileSync(CREDENTIALS_DOC, doc);
}

function parseArgs(argv) {
  const options = { end: new Date(), days: 7 };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--end') options.end = new Date(value);
    else if (key === '--days') options.days = Number(value);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Number.isNaN(options.end.getTime())) throw new Error('--end must be an ISO 8601 date');
  if (!Number.isInteger(options.days) || options.days < 1) {
    throw new Error('--days must be a whole number of at least 1');
  }
  // Round down to a whole 15-minute slot so every reading sits on the same grid.
  const endMs = Math.floor(options.end.getTime() / SLOT_MS) * SLOT_MS;
  return { endMs, days: options.days };
}

function main() {
  const { endMs, days } = parseArgs(process.argv.slice(2));

  const provinces = PROVINCES;
  const districts = DISTRICTS.map(({ id, name, province_id }) => ({ id, name, province_id }));
  const { substations, townBySubstation } = buildSubstations();
  const { installations, deviceKeys, offlineFrom } = buildInstallations(
    substations,
    townBySubstation,
    endMs,
    days,
  );
  const users = buildUsers();
  const readingLines = buildReadings(installations, offlineFrom, endMs, days);

  fs.mkdirSync(SEED_DIR, { recursive: true });
  const files = {
    'provinces.json': JSON.stringify(provinces, null, 2),
    'districts.json': JSON.stringify(districts, null, 2),
    'substations.json': JSON.stringify(substations, null, 2),
    'installations.json': JSON.stringify(installations, null, 2),
    // About 20 MB, so one compact record per line instead of pretty-printing.
    'readings.json': `[\n${readingLines.join(',\n')}\n]`,
    'users.json': JSON.stringify(users, null, 2),
    'device-keys.local.json': JSON.stringify(deviceKeys, null, 2),
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(SEED_DIR, name), `${content}\n`);
  }
  writeCredentialsDoc(users, deviceKeys);

  console.log(`Seed written to data/seed/ (window ends ${toIso(endMs)}, ${days} days)`);
  const counts = {
    'provinces.json': provinces.length,
    'districts.json': districts.length,
    'substations.json': substations.length,
    'installations.json': installations.length,
    'readings.json': readingLines.length,
    'users.json': users.length,
    'device-keys.local.json': deviceKeys.length,
  };
  for (const [name, count] of Object.entries(counts)) {
    const kb = fs.statSync(path.join(SEED_DIR, name)).size / 1024;
    console.log(
      `  ${name.padEnd(24)} ${String(count).padStart(7)} records ${kb.toFixed(1).padStart(10)} KB`,
    );
  }
}

main();
