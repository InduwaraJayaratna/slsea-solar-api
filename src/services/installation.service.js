const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');

// Installations across the whole estate. `filters` holds only the filters the
// client sent (province_id, district_id, substation_id, status); each must match.
async function listInstallations(filters, paging) {
  return paginate(await repositories.installations.findAll(filters), paging);
}

// The installations on one substation; null if the substation does not exist.
async function listInstallationsOnSubstation(substationId, paging) {
  if (!(await repositories.substations.findById(substationId))) return null;
  return paginate(
    await repositories.installations.findAll({ substation_id: substationId }),
    paging,
  );
}

// null if there is no such installation.
async function getInstallation(installationId) {
  return repositories.installations.findById(installationId);
}

module.exports = { listInstallations, listInstallationsOnSubstation, getInstallation };
