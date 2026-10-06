const repositories = require('../repositories');
const { paginate } = require('../utils/pagination');
const readingService = require('./reading.service');

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

// The installation with its place in the hierarchy, latest reading and energy
// so far today. null if the installation does not exist.
async function getOverview(installationId) {
  const installation = await repositories.installations.findById(installationId);
  if (!installation) return null;

  // Independent lookups, so run them together.
  const [substation, district, province, lastReading, energyToday] = await Promise.all([
    repositories.substations.findById(installation.substation_id),
    repositories.districts.findById(installation.district_id),
    repositories.provinces.findById(installation.province_id),
    readingService.findLatestReading(installationId),
    readingService.getEnergyToday(installationId),
  ]);
  return { installation, substation, district, province, lastReading, energyToday };
}

module.exports = {
  listInstallations,
  listInstallationsOnSubstation,
  getInstallation,
  getOverview,
};
