const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');
const { scopeOf, assertAccess, locationOf } = require('./jurisdiction');
const AppError = require('../utils/app-error');

// Narrowed to the user's province (a district user sees their parent province).
async function listProvinces(user, paging) {
  const { province_id: provinceId } = scopeOf(user);
  const filter = provinceId ? { id: provinceId } : {};
  return paginate(await repositories.provinces.findAll(filter), paging);
}

// 404 if it does not exist, 403 if it is outside the user's jurisdiction.
async function getProvince(user, provinceId) {
  const province = await repositories.provinces.findById(provinceId);
  if (!province) throw AppError.notFound(`Province "${provinceId}" not found`);
  assertAccess(user, locationOf.province(province), `Province "${provinceId}"`);
  return province;
}

module.exports = { listProvinces, getProvince };
