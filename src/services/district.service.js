const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');
const { scopeOf, assertAccess, locationOf } = require('./jurisdiction');
const { getProvince } = require('./province.service');
const AppError = require('../utils/app-error');

// The districts of one province: 404/403 come from the province check. A
// district user only sees their own district in the list, not its siblings.
async function listDistrictsInProvince(user, provinceId, paging) {
  await getProvince(user, provinceId);
  const { district_id: districtId } = scopeOf(user);
  const filter = districtId
    ? { province_id: provinceId, id: districtId }
    : { province_id: provinceId };
  return paginate(await repositories.districts.findAll(filter), paging);
}

async function getDistrict(user, districtId) {
  const district = await repositories.districts.findById(districtId);
  if (!district) throw AppError.notFound(`District "${districtId}" not found`);
  assertAccess(user, locationOf.district(district), `District "${districtId}"`);
  return district;
}

module.exports = { listDistrictsInProvince, getDistrict };
