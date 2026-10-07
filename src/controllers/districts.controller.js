const districtService = require('../services/district.service');
const { serializeDistrict } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const { sendConditional } = require('../utils/conditional-get');
const generationSummaryService = require('../services/generation-summary.service');
const check = require('./query-params');

// GET /provinces/{province_id}/districts
async function listDistrictsInProvince(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await districtService.listDistrictsInProvince(
    req.user,
    req.params.province_id,
    query,
  );
  sendCollection(req, res, page, query, serializeDistrict);
}

async function getDistrict(req, res) {
  parseQuery(req.query);
  const district = await districtService.getDistrict(req.user, req.params.district_id);
  sendResource(req, res, district, serializeDistrict);
}

// GET /districts/{district_id}/generation-summary?date=YYYY-MM-DD
async function getGenerationSummary(req, res) {
  const query = parseQuery(req.query, { params: { date: check.calendarDate } });
  const { district, ...summary } = await generationSummaryService.getDistrictGenerationSummary(
    req.user,
    req.params.district_id,
    query.params.date,
  );
  const body = { district: serializeDistrict(district), ...summary };

  // generated_at changes on every request, so the ETag is a weak one built from
  // everything else: it changes only when the figures themselves change. There
  // is no Last-Modified, because the figures also change with the clock (an
  // installation stops reporting without any new data arriving).
  // (JSON.stringify leaves out undefined fields, so generated_at is not hashed.)
  sendConditional(req, res, body, null, { weakEtagFrom: { ...body, generated_at: undefined } });
}

module.exports = { listDistrictsInProvince, getDistrict, getGenerationSummary };
