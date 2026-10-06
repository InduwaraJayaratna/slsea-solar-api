// The installation overview: one response for an operations screen.
const repositories = require('../repositories');
const { getInstallation } = require('./installation.service');
const { findLatestReading, getEnergyToday } = require('./reading.service');

// The installation with its place in the hierarchy, latest reading and energy
// so far today. 404/403 come from the installation check.
async function getOverview(user, installationId) {
  const installation = await getInstallation(user, installationId);

  // Independent lookups, so run them together. The parents need no access
  // check of their own: they contain the installation, so a user who may see
  // it may see their names.
  const [substation, district, province, lastReading, energyToday] = await Promise.all([
    repositories.substations.findById(installation.substation_id),
    repositories.districts.findById(installation.district_id),
    repositories.provinces.findById(installation.province_id),
    findLatestReading(installationId),
    getEnergyToday(installationId),
  ]);
  return { installation, substation, district, province, lastReading, energyToday };
}

module.exports = { getOverview };
