// The one validator for request bodies. A schema lists each accepted field and
// its rule; every problem is collected, so one 400 response has one details
// entry per bad field.
//
// Rule options:
//   type          'string' | 'number' | 'integer' | 'timestamp' | 'enum'
//   required      must be present (ignored for a partial update)
//   min / max     inclusive bounds for numbers
//   greaterThan   exclusive lower bound for numbers
//   values        allowed values for 'enum'
//   wholeMinute   for 'timestamp': seconds must be zero
const AppError = require('./app-error');
const { parseIso8601, toIsoUtc } = require('./iso-8601');

const MAX_STRING_LENGTH = 200;

// Returns an error message for one value, or null if it is fine.
function checkValue(value, rule) {
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string' || value.trim() === '') return 'must be a non-empty string';
      if (value.length > MAX_STRING_LENGTH)
        return `must be at most ${MAX_STRING_LENGTH} characters`;
      return null;
    case 'number':
    case 'integer':
      // typeof check rejects "5" (a string): JSON numbers must be numbers.
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
      if (rule.type === 'integer' && !Number.isInteger(value)) return 'must be a whole number';
      if (rule.min !== undefined && value < rule.min) return `must be at least ${rule.min}`;
      if (rule.greaterThan !== undefined && value <= rule.greaterThan) {
        return `must be greater than ${rule.greaterThan}`;
      }
      if (rule.max !== undefined && value > rule.max) return `must be at most ${rule.max}`;
      return null;
    case 'timestamp': {
      // Body timestamps must be full UTC date-times ("...Z"), as stored.
      const ms = typeof value === 'string' && value.includes('T') ? parseIso8601(value) : null;
      if (ms === null || !value.endsWith('Z')) {
        return 'must be an ISO 8601 UTC date-time, e.g. 2026-10-05T06:15:00Z';
      }
      if (rule.wholeMinute && ms % 60000 !== 0) return 'must be on a whole minute (seconds 00)';
      return null;
    }
    case 'enum':
      return rule.values.includes(value) ? null : `must be one of ${rule.values.join(', ')}`;
    default:
      throw new Error(`Unknown rule type "${rule.type}"`); // a bug in a schema, not bad input
  }
}

// options.partial: a partial update (PATCH); no field is required, but at least
// one must be sent. options.readOnly: fields the client may see but not set.
// Returns the accepted fields, with timestamps normalised to the stored format.
function validateBody(body, schema, { partial = false, readOnly = [] } = {}) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw AppError.badRequest('Invalid request body', [
      { field: 'body', message: 'must be a JSON object' },
    ]);
  }

  const details = [];
  const problem = (field, message) => details.push({ field, message });

  for (const field of Object.keys(body)) {
    if (readOnly.includes(field)) problem(field, 'is read-only and cannot be set');
    else if (!schema[field]) problem(field, 'is not a supported field');
  }

  const accepted = {};
  for (const [field, rule] of Object.entries(schema)) {
    if (!(field in body)) {
      if (rule.required && !partial) problem(field, 'is required');
      continue;
    }
    const message = checkValue(body[field], rule);
    if (message) problem(field, message);
    else {
      accepted[field] = rule.type === 'timestamp' ? toIsoUtc(Date.parse(body[field])) : body[field];
    }
  }

  if (partial && Object.keys(body).length === 0) {
    problem('body', 'must contain at least one field to change');
  }
  if (details.length > 0) throw AppError.badRequest('Invalid request body', details);
  return accepted;
}

module.exports = validateBody;
