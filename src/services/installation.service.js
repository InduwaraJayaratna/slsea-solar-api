const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');
const { scopeOf, assertAccess, locationOf, assertFiltersAccessible } = require('./jurisdiction');
const { getSubstation } = require('./substation.service');
const AppError = require('../utils/app-error');

// Installations across the estate. Explicit filters outside the user's
// jurisdiction are refused (403); then the result is narrowed to it.
// `filters` holds only the filters the client sent (province_id, district_id,
// substation_id, status).
async function listInstallations(user, filters, paging) {
  await assertFiltersAccessible(user, filters);
  return paginate(
    await repositories.installations.findAll({ ...filters, ...scopeOf(user) }),
    paging,
  );
}

// The installations on one substation; 404/403 come from the substation check.
async function listInstallationsOnSubstation(user, substationId, paging) {
  await getSubstation(user, substationId);
  return paginate(
    await repositories.installations.findAll({ substation_id: substationId }),
    paging,
  );
}

async function getInstallation(user, installationId) {
  const installation = await repositories.installations.findById(installationId);
  if (!installation) throw AppError.notFound(`Installation "${installationId}" not found`);
  assertAccess(user, locationOf.installation(installation), `Installation "${installationId}"`);
  return installation;
}

module.exports = { listInstallations, listInstallationsOnSubstation, getInstallation };
