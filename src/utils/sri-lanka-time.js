// Sri Lanka local days. Sri Lanka is UTC+05:30 all year (no daylight saving),
// so a fixed offset is exact.
const OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The Sri Lanka calendar day containing the instant `ms`: its date
// (YYYY-MM-DD) and its start and end as UTC milliseconds. Local midnight is
// 18:30 UTC on the previous day.
function sriLankaDay(ms) {
  const localDayStart = Math.floor((ms + OFFSET_MS) / DAY_MS) * DAY_MS;
  return {
    date: new Date(localDayStart).toISOString().slice(0, 10),
    startMs: localDayStart - OFFSET_MS,
    endMs: localDayStart - OFFSET_MS + DAY_MS,
  };
}

// The Sri Lanka day for a calendar date such as "2026-10-05".
const sriLankaDayOf = (date) => sriLankaDay(Date.parse(`${date}T00:00:00+05:30`));

module.exports = { sriLankaDay, sriLankaDayOf };
