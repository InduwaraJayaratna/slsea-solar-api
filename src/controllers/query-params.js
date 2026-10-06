// Checks for query parameter values, shared by the controllers. Each returns an
// error message, or null when the value is fine (the form parseQuery expects).
// Ids are checked for form, not existence: a well-formed id that matches
// nothing simply gives an empty result.

const matches = (pattern, message) => (value) => (pattern.test(value) ? null : message);

const STATUSES = ['active', 'inactive', 'maintenance'];
const READING_SORTS = ['timestamp', '-timestamp'];

// A date (2026-10-05, meaning 00:00 UTC) or a date-time with a time zone
// (2026-10-05T06:30:00Z or ...+05:30). A time without a zone is rejected,
// because it would be read in the server's local time zone.
const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

function isoTimestamp(value) {
  const match = ISO_8601.exec(value);
  if (match && !Number.isNaN(Date.parse(value))) {
    // Date.parse quietly rolls 2026-02-30 over to 2 March, so check the day too.
    const [year, month, day] = match.slice(1, 4).map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth) return null;
  }
  return 'must be an ISO 8601 date, or date-time with a time zone, e.g. 2026-10-05T00:00:00Z';
}

module.exports = {
  provinceId: matches(/^[A-Z]{2}$/, 'must be a province id such as WP'),
  districtId: matches(/^[A-Z]{3}$/, 'must be a district id such as COL'),
  substationId: matches(/^SUB-[0-9]+$/, 'must be a substation id such as SUB-001'),
  installationId: matches(/^INST-[0-9]+$/, 'must be an installation id such as INST-0001'),
  status: (value) => (STATUSES.includes(value) ? null : `must be one of ${STATUSES.join(', ')}`),
  isoTimestamp,
  readingSort: (value) =>
    READING_SORTS.includes(value) ? null : `must be one of ${READING_SORTS.join(', ')}`,
};
