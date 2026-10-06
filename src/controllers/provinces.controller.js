const provinceService = require('../services/province.service');
const { serializeProvince } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const AppError = require('../utils/app-error');

async function listProvinces(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await provinceService.listProvinces(query);
  sendCollection(req, res, page, query, serializeProvince);
}

async function getProvince(req, res) {
  parseQuery(req.query); // a single resource takes no query parameters
  const province = await provinceService.getProvince(req.params.province_id);
  if (!province) throw AppError.notFound(`Province "${req.params.province_id}" not found`);
  sendResource(req, res, province, serializeProvince);
}

module.exports = { listProvinces, getProvince };
