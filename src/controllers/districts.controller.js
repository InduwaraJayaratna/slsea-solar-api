const districtService = require('../services/district.service');
const { serializeDistrict } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');

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

module.exports = { listDistrictsInProvince, getDistrict };
