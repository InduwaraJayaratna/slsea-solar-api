const districtService = require('../services/district.service');
const { serializeDistrict } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const AppError = require('../utils/app-error');

// GET /provinces/{province_id}/districts
async function listDistrictsInProvince(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await districtService.listDistrictsInProvince(req.params.province_id, query);
  if (!page) throw AppError.notFound(`Province "${req.params.province_id}" not found`);
  sendCollection(req, res, page, query, serializeDistrict);
}

async function getDistrict(req, res) {
  parseQuery(req.query);
  const district = await districtService.getDistrict(req.params.district_id);
  if (!district) throw AppError.notFound(`District "${req.params.district_id}" not found`);
  sendResource(req, res, district, serializeDistrict);
}

module.exports = { listDistrictsInProvince, getDistrict };
