const installationService = require('../services/installation.service');
const { serializeInstallation, serializeReading, serializeReference } = require('../serializers');
const check = require('./query-params');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const sendConditional = require('../utils/conditional-get');
const AppError = require('../utils/app-error');

// Filters for GET /installations.
const INSTALLATION_FILTERS = {
  province_id: check.provinceId,
  district_id: check.districtId,
  substation_id: check.substationId,
  status: check.status,
};

// GET /installations
async function listInstallations(req, res) {
  const query = parseQuery(req.query, { paginated: true, params: INSTALLATION_FILTERS });
  const page = await installationService.listInstallations(query.params, query);
  sendCollection(req, res, page, query, serializeInstallation);
}

// GET /substations/{substation_id}/installations
async function listInstallationsOnSubstation(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await installationService.listInstallationsOnSubstation(
    req.params.substation_id,
    query,
  );
  if (!page) throw AppError.notFound(`Substation "${req.params.substation_id}" not found`);
  sendCollection(req, res, page, query, serializeInstallation);
}

async function getInstallation(req, res) {
  parseQuery(req.query);
  const installation = await installationService.getInstallation(req.params.installation_id);
  if (!installation) {
    throw AppError.notFound(`Installation "${req.params.installation_id}" not found`);
  }
  sendResource(req, res, installation, serializeInstallation);
}

// GET /installations/{installation_id}/overview: everything an operations
// screen needs for one installation, in one response.
async function getOverview(req, res) {
  parseQuery(req.query);
  const overview = await installationService.getOverview(req.params.installation_id);
  if (!overview) {
    throw AppError.notFound(`Installation "${req.params.installation_id}" not found`);
  }
  const { installation, substation, district, province, lastReading, energyToday } = overview;

  const body = {
    installation: serializeInstallation(installation),
    substation: serializeReference(substation),
    district: serializeReference(district),
    province: serializeReference(province),
    last_reading: lastReading ? serializeReading(lastReading) : null,
    today: { date: energyToday.date, energy_kwh: energyToday.energyKwh },
  };

  // The overview last changed at the latest of: the installation's update, its
  // newest reading, and local midnight (when "today" restarts at zero).
  const lastModified = Math.max(
    Date.parse(installation.updated_at),
    lastReading ? Date.parse(lastReading.timestamp) : 0,
    energyToday.startMs,
  );
  sendConditional(req, res, body, lastModified);
}

module.exports = {
  listInstallations,
  listInstallationsOnSubstation,
  getInstallation,
  getOverview,
};
