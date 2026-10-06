// Generation readings: history, estate-wide queries, the latest reading and
// today's energy.
const repositories = require('../repositories');
const clock = require('../utils/clock');
const { sriLankaDay } = require('../utils/sri-lanka-time');

// A reading older than this is stale: the installation should report every
// 15 minutes, so 30 minutes means at least one report is missing.
const STALE_AFTER_SECONDS = 30 * 60;

// One page of readings matching `filter`, plus the total and the newest
// timestamp among all matches (the collection's Last-Modified).
// `options` holds sort, page and page_size from the parsed query.
async function findPage(filter, { sort, page, page_size: pageSize }) {
  const [result, newest] = await Promise.all([
    repositories.readings.findMany(filter, { sort, skip: (page - 1) * pageSize, limit: pageSize }),
    repositories.readings.findMany(filter, { sort: '-timestamp', limit: 1 }),
  ]);
  return {
    items: result.items,
    total: result.total,
    lastModified: newest.items[0]?.timestamp ?? null,
  };
}

// An installation's history, optionally within a time window.
// null if the installation does not exist.
async function listInstallationReadings(installationId, { from, to }, options) {
  if (!(await repositories.installations.findById(installationId))) return null;
  return findPage({ installation_ids: [installationId], from, to }, options);
}

// Readings across the estate. The jurisdiction filters are resolved to a list
// of installation ids first, then readings are queried by those ids, so the
// readings themselves never need province or district fields.
async function listReadings(
  { province_id, district_id, substation_id, installation_id, from, to },
  options,
) {
  const jurisdiction = Object.fromEntries(
    Object.entries({ province_id, district_id, substation_id, id: installation_id }).filter(
      ([, value]) => value !== undefined,
    ),
  );

  // No jurisdiction filter means every installation, so skip the id list.
  let installationIds;
  if (Object.keys(jurisdiction).length > 0) {
    const installations = await repositories.installations.findAll(jurisdiction);
    installationIds = installations.map((installation) => installation.id);
  }
  return findPage({ installation_ids: installationIds, from, to }, options);
}

// One reading, only if it belongs to the installation; otherwise null.
async function getInstallationReading(installationId, readingId) {
  const reading = await repositories.readings.findById(readingId);
  return reading && reading.installation_id === installationId ? reading : null;
}

// The installation's most recent reading, or null if it has none.
async function findLatestReading(installationId, window = {}) {
  const { items } = await repositories.readings.findMany(
    { installation_ids: [installationId], ...window },
    { sort: '-timestamp', limit: 1 },
  );
  return items[0] ?? null;
}

// The latest reading with how old it is and whether it is stale.
// Returns { installation: null } if the installation does not exist, and
// { installation, reading: null } if it exists but has not reported yet.
async function getLastReading(installationId) {
  const installation = await repositories.installations.findById(installationId);
  if (!installation) return { installation: null };

  const reading = await findLatestReading(installationId);
  if (!reading) return { installation, reading: null };

  const ageSeconds = Math.max(0, Math.floor((clock.now() - Date.parse(reading.timestamp)) / 1000));
  return {
    installation,
    reading,
    age_seconds: ageSeconds,
    stale: ageSeconds > STALE_AFTER_SECONDS,
  };
}

// Energy generated so far in the current Sri Lanka day, in kWh.
// energy_kwh is the meter's running total, so today's energy is the latest
// total today minus the last total before local midnight. (The reading at
// 00:00 local covers 23:45-00:00, but solar output then is zero.)
async function getEnergyToday(installationId) {
  const day = sriLankaDay(clock.now());
  const startOfDay = new Date(day.startMs).toISOString();
  const endOfDay = new Date(day.endMs).toISOString();

  const latestToday = await findLatestReading(installationId, { from: startOfDay, to: endOfDay });
  if (!latestToday) return { date: day.date, startMs: day.startMs, energyKwh: 0 };

  // If the installation has no reading before today (e.g. new today), count
  // from its first reading today instead.
  let baseline = await findLatestReading(installationId, { to: startOfDay });
  if (!baseline) {
    const { items } = await repositories.readings.findMany(
      { installation_ids: [installationId], from: startOfDay, to: endOfDay },
      { sort: 'timestamp', limit: 1 },
    );
    baseline = items[0];
  }

  // Rounded to the meter's precision (3 decimals) to hide floating-point noise.
  const energyKwh = Number((latestToday.energy_kwh - baseline.energy_kwh).toFixed(3));
  return { date: day.date, startMs: day.startMs, energyKwh };
}

module.exports = {
  listInstallationReadings,
  listReadings,
  getInstallationReading,
  findLatestReading,
  getLastReading,
  getEnergyToday,
};
