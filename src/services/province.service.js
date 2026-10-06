const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');

async function listProvinces(paging) {
  return paginate(await repositories.provinces.findAll(), paging);
}

// null if there is no such province.
async function getProvince(provinceId) {
  return repositories.provinces.findById(provinceId);
}

module.exports = { listProvinces, getProvince };
