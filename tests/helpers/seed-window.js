// The seed's time window, read from the seed itself, so tests keep passing when
// the seed is regenerated with a new end time (npm run seed:generate ends the
// week of readings "now").
const seedReadings = require('../../data/seed/readings.json');

const DAY_MS = 24 * 60 * 60 * 1000;
// Sri Lanka time is UTC+05:30 all year.
const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// When the newest seed reading was taken, in milliseconds.
const SEED_END_MS = seedReadings.reduce(
  (latest, reading) => Math.max(latest, Date.parse(reading.timestamp)),
  0,
);

// ISO 8601 UTC without milliseconds, like the API's timestamps.
const toIso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

// The calendar date (YYYY-MM-DD) of a moment, in UTC or in Sri Lanka.
const utcDateOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const sriLankaDateOf = (ms) => utcDateOf(ms + SRI_LANKA_OFFSET_MS);

module.exports = { DAY_MS, SEED_END_MS, toIso, utcDateOf, sriLankaDateOf };
