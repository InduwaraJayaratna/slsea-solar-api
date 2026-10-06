const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');

// The districts of one province. null if the province does not exist, so the
// caller can tell "no such province" apart from "a province with no districts".
async function listDistrictsInProvince(provinceId, paging) {
  if (!(await repositories.provinces.findById(provinceId))) return null;
  return paginate(await repositories.districts.findAll({ province_id: provinceId }), paging);
}

// null if there is no such district.
async function getDistrict(districtId) {
  return repositories.districts.findById(districtId);
}

module.exports = { listDistrictsInProvince, getDistrict };
