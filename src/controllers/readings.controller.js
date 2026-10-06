const readingService = require('../services/reading.service');
const { serializeReading } = require('../serializers');
const check = require('./query-params');
const { parseQuery } = require('../utils/query');
const { sendCollection } = require('../utils/respond');
const { sendConditional } = require('../utils/conditional-get');
const AppError = require('../utils/app-error');
const validateBody = require('../utils/validate-body');
const { READING } = require('./body-schemas');

// Parameters both reading collections accept, besides page and page_size.
const READING_PARAMS = {
  from: check.isoTimestamp,
  to: check.isoTimestamp,
  sort: check.readingSort,
};

// Extra filters for the estate-wide GET /readings.
const JURISDICTION_FILTERS = {
  province_id: check.provinceId,
  district_id: check.districtId,
  substation_id: check.substationId,
  installation_id: check.installationId,
};

// Validates the query, then checks the window: from must be before to.
// Returns the filters, the window as UTC ISO strings, and sort/page options.
function parseReadingQuery(query, extraParams = {}) {
  const parsed = parseQuery(query, {
    paginated: true,
    params: { ...READING_PARAMS, ...extraParams },
  });
  const { from, to, sort = '-timestamp', ...filters } = parsed.params;

  if (from && to && Date.parse(from) >= Date.parse(to)) {
    throw AppError.badRequest('Invalid query parameters', [
      { parameter: 'from', message: 'must be earlier than to' },
    ]);
  }
  const toUtc = (value) => value && new Date(value).toISOString();
  return {
    filters: { ...filters, from: toUtc(from), to: toUtc(to) },
    options: { sort, page: parsed.page, page_size: parsed.page_size },
  };
}

// GET /installations/{installation_id}/readings
async function listInstallationReadings(req, res) {
  const { filters, options } = parseReadingQuery(req.query);
  const page = await readingService.listInstallationReadings(
    req.user,
    req.params.installation_id,
    filters,
    options,
  );
  sendCollection(req, res, page, options, serializeReading);
}

// GET /readings
async function listReadings(req, res) {
  const { filters, options } = parseReadingQuery(req.query, JURISDICTION_FILTERS);
  const page = await readingService.listReadings(req.user, filters, options);
  sendCollection(req, res, page, options, serializeReading);
}

// GET /installations/{installation_id}/readings/{reading_id}
async function getInstallationReading(req, res) {
  parseQuery(req.query);
  const reading = await readingService.getInstallationReading(
    req.user,
    req.params.installation_id,
    req.params.reading_id,
  );
  // Readings are append-only and never change, so their timestamp is their Last-Modified.
  sendConditional(req, res, serializeReading(reading), reading.timestamp);
}

// GET /installations/{installation_id}/last-reading: a derived resource, the
// latest reading plus how old it is.
async function getLastReading(req, res) {
  parseQuery(req.query);
  const {
    reading,
    age_seconds: ageSeconds,
    stale,
  } = await readingService.getLastReading(req.user, req.params.installation_id);
  const body = { ...serializeReading(reading), age_seconds: ageSeconds, stale };

  // age_seconds changes every second, so the ETag is a weak one built from
  // what actually matters: which reading it is and whether it is stale.
  // Last-Modified moves forward when the reading becomes stale.
  const readingMs = Date.parse(reading.timestamp);
  const lastModified = stale ? readingMs + 30 * 60 * 1000 : readingMs;
  sendConditional(req, res, body, lastModified, { weakEtagFrom: { id: reading.id, stale } });
}

// POST /installations/{installation_id}/readings: a metering device reports a
// reading. authenticateDevice has already checked the key and set req.device.
async function ingestReading(req, res) {
  parseQuery(req.query);
  const fields = validateBody(req.body, READING);
  const { installation_id: installationId } = req.device;
  const reading = await readingService.ingestReading(installationId, fields);

  res
    .status(201)
    .location(`/api/v1/installations/${installationId}/readings/${reading.id}`)
    .json(serializeReading(reading));
}

module.exports = {
  ingestReading,
  listInstallationReadings,
  listReadings,
  getInstallationReading,
  getLastReading,
};
