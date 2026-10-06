// Generation readings: history, estate-wide queries, the latest reading and
// today's energy.
const repositories = require('../repositories');
const clock = require('../utils/clock');
const { sriLankaDay } = require('../utils/sri-lanka-time');
const { scopeOf, assertFiltersAccessible } = require('./jurisdiction');
const { getInstallation } = require('./installation.service');
const AppError = require('../utils/app-error');
const { DuplicateKeyError } = require('../repositories/errors');

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

// An installation's history, optionally within a time window. 404/403 come
// from the installation check.
async function listInstallationReadings(user, installationId, { from, to }, options) {
  await getInstallation(user, installationId);
  return findPage({ installation_ids: [installationId], from, to }, options);
}

// Readings across the estate. The jurisdiction filters, plus the user's own
// jurisdiction, are resolved to a list of installation ids first, then readings
// are queried by those ids, so readings never need province or district fields.
async function listReadings(user, filters, options) {
  const { province_id, district_id, substation_id, installation_id, from, to } = filters;
  await assertFiltersAccessible(user, filters);
  const jurisdiction = Object.fromEntries(
    Object.entries({
      province_id,
      district_id,
      substation_id,
      id: installation_id,
      ...scopeOf(user),
    }).filter(([, value]) => value !== undefined),
  );

  // No filter and no scope means every installation, so skip the id list.
  let installationIds;
  if (Object.keys(jurisdiction).length > 0) {
    const installations = await repositories.installations.findAll(jurisdiction);
    installationIds = installations.map((installation) => installation.id);
  }
  return findPage({ installation_ids: installationIds, from, to }, options);
}

// One reading of an installation. 404 if there is no such reading, or it
// belongs to a different installation.
async function getInstallationReading(user, installationId, readingId) {
  await getInstallation(user, installationId);
  const reading = await repositories.readings.findById(readingId);
  if (!reading || reading.installation_id !== installationId) {
    throw AppError.notFound(
      `Reading "${readingId}" not found for installation "${installationId}"`,
    );
  }
  return reading;
}

// The installation's most recent reading, or null if it has none.
async function findLatestReading(installationId, window = {}) {
  const { items } = await repositories.readings.findMany(
    { installation_ids: [installationId], ...window },
    { sort: '-timestamp', limit: 1 },
  );
  return items[0] ?? null;
}

// The latest reading with how old it is and whether it is stale. 404/403 come
// from the installation check; an installation that has not reported yet gets
// a 404 with its own code, so clients can tell the two cases apart.
async function getLastReading(user, installationId) {
  await getInstallation(user, installationId);
  const reading = await findLatestReading(installationId);
  if (!reading) {
    throw new AppError(404, 'NO_READINGS', `Installation "${installationId}" has no readings yet`);
  }

  const ageSeconds = Math.max(0, Math.floor((clock.now() - Date.parse(reading.timestamp)) / 1000));
  return { reading, age_seconds: ageSeconds, stale: ageSeconds > STALE_AFTER_SECONDS };
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

// Readings may be timestamped at most this far ahead of the server's clock, to
// allow for a device clock that runs slightly fast.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// A reading's id is its installation plus its compact UTC time, e.g.
// INST-0001-20261005T0615Z. So the same reading sent twice gets the same id,
// and the second copy is refused instead of stored twice.
function readingIdFor(installationId, timestamp) {
  const compact = `${timestamp.slice(0, 4)}${timestamp.slice(5, 7)}${timestamp.slice(8, 13)}${timestamp.slice(14, 16)}Z`;
  return `${installationId}-${compact}`;
}

// The reading just before (or just after) `timestamp`, or null.
async function neighbourReading(installationId, timestamp, direction) {
  const range = direction === 'before' ? { to: timestamp } : { from: timestamp };
  const { items } = await repositories.readings.findMany(
    { installation_ids: [installationId], ...range },
    { sort: direction === 'before' ? '-timestamp' : 'timestamp', limit: 1 },
  );
  return items[0] ?? null;
}

// Stores a reading sent by an installation's device. `fields` has already been
// validated (timestamp, power_kw, energy_kwh, voltage_v); these are the checks
// that depend on stored data or on the clock.
async function ingestReading(installationId, fields) {
  if (Date.parse(fields.timestamp) > clock.now() + MAX_CLOCK_SKEW_MS) {
    throw AppError.badRequest('Invalid request body', [
      { field: 'timestamp', message: 'must not be more than 5 minutes in the future' },
    ]);
  }

  const installation = await repositories.installations.findById(installationId);
  if (installation.status !== 'active') {
    throw new AppError(
      409,
      'INSTALLATION_NOT_ACTIVE',
      `Installation "${installationId}" is ${installation.status} and does not accept readings`,
    );
  }

  const id = readingIdFor(installationId, fields.timestamp);
  const duplicate = new AppError(
    409,
    'DUPLICATE_READING',
    `A reading for ${fields.timestamp} already exists (${id})`,
  );
  if (await repositories.readings.findById(id)) throw duplicate;

  // energy_kwh is the meter's running total, so it may never go down: it must
  // be at least the previous reading's, and (for a late reading filling a gap)
  // at most the next reading's.
  const previous = await neighbourReading(installationId, fields.timestamp, 'before');
  const next = await neighbourReading(installationId, fields.timestamp, 'after');
  if (
    (previous && fields.energy_kwh < previous.energy_kwh) ||
    (next && fields.energy_kwh > next.energy_kwh)
  ) {
    const bound = previous && fields.energy_kwh < previous.energy_kwh ? previous : next;
    throw new AppError(
      409,
      'ENERGY_DECREASED',
      `energy_kwh ${fields.energy_kwh} would make the meter total go backwards ` +
        `(reading ${bound.id} has ${bound.energy_kwh})`,
    );
  }

  try {
    return await repositories.readings.appendReading({
      id,
      installation_id: installationId,
      timestamp: fields.timestamp,
      power_kw: fields.power_kw,
      energy_kwh: fields.energy_kwh,
      voltage_v: fields.voltage_v,
    });
  } catch (error) {
    // Another request stored the same reading between the check and the write.
    if (error instanceof DuplicateKeyError) throw duplicate;
    throw error;
  }
}

module.exports = {
  ingestReading,
  listInstallationReadings,
  listReadings,
  getInstallationReading,
  findLatestReading,
  getLastReading,
  getEnergyToday,
};
