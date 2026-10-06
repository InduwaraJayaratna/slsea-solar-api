const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');
const { assertAccess, locationOf } = require('./jurisdiction');
const { getDistrict } = require('./district.service');
const AppError = require('../utils/app-error');

// The substations of one district. If the user may see the district, they may
// see everything in it, so the district check is enough.
async function listSubstationsInDistrict(user, districtId, paging) {
  await getDistrict(user, districtId);
  return paginate(await repositories.substations.findAll({ district_id: districtId }), paging);
}

async function getSubstation(user, substationId) {
  const substation = await repositories.substations.findById(substationId);
  if (!substation) throw AppError.notFound(`Substation "${substationId}" not found`);
  assertAccess(user, await locationOf.substation(substation), `Substation "${substationId}"`);
  return substation;
}

module.exports = { listSubstationsInDistrict, getSubstation };
