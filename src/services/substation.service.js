const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');

// The substations of one district; null if the district does not exist.
async function listSubstationsInDistrict(districtId, paging) {
  if (!(await repositories.districts.findById(districtId))) return null;
  return paginate(await repositories.substations.findAll({ district_id: districtId }), paging);
}

// null if there is no such substation.
async function getSubstation(substationId) {
  return repositories.substations.findById(substationId);
}

module.exports = { listSubstationsInDistrict, getSubstation };
