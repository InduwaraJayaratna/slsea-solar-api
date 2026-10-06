// Parsing and formatting ISO 8601 timestamps, shared by query and body checks.

// A date (2026-10-05, meaning 00:00 UTC) or a date-time with a time zone
// (2026-10-05T06:30:00Z or ...+05:30). A time without a zone is rejected,
// because it would be read in the server's local time zone.
const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

// Milliseconds since 1970 for a valid ISO 8601 string, otherwise null.
function parseIso8601(value) {
  const match = ISO_8601.exec(value);
  const ms = match ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) return null;
  // Date.parse quietly rolls 2026-02-30 over to 2 March, so check the day too.
  const [year, month, day] = match.slice(1, 4).map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth ? ms : null;
}

// The API's timestamp format: UTC, whole seconds, e.g. 2026-10-05T06:15:00Z.
const toIsoUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

module.exports = { parseIso8601, toIsoUtc };
