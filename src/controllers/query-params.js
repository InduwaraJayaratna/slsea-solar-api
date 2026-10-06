// Checks for query parameter values, shared by the controllers. Each returns an
// error message, or null when the value is fine (the form parseQuery expects).
// Ids are checked for form, not existence: a well-formed id that matches
// nothing simply gives an empty result.

const { parseIso8601 } = require('../utils/iso-8601');

const matches = (pattern, message) => (value) => (pattern.test(value) ? null : message);

const STATUSES = ['active', 'inactive', 'maintenance'];
const READING_SORTS = ['timestamp', '-timestamp'];

function isoTimestamp(value) {
  return parseIso8601(value) === null
    ? 'must be an ISO 8601 date, or date-time with a time zone, e.g. 2026-10-05T00:00:00Z'
    : null;
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
