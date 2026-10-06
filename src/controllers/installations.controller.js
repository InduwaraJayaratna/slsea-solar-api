const installationService = require('../services/installation.service');
const overviewService = require('../services/overview.service');
const { serializeInstallation, serializeReading, serializeReference } = require('../serializers');
const check = require('./query-params');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const sendConditional = require('../utils/conditional-get');

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
  const page = await installationService.listInstallations(req.user, query.params, query);
  sendCollection(req, res, page, query, serializeInstallation);
}

// GET /substations/{substation_id}/installations
async function listInstallationsOnSubstation(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await installationService.listInstallationsOnSubstation(
    req.user,
    req.params.substation_id,
    query,
  );
  sendCollection(req, res, page, query, serializeInstallation);
}

async function getInstallation(req, res) {
  parseQuery(req.query);
  const installation = await installationService.getInstallation(
    req.user,
    req.params.installation_id,
  );
  sendResource(req, res, installation, serializeInstallation);
}

// GET /installations/{installation_id}/overview: everything an operations
// screen needs for one installation, in one response.
async function getOverview(req, res) {
  parseQuery(req.query);
  const { installation, substation, district, province, lastReading, energyToday } =
    await overviewService.getOverview(req.user, req.params.installation_id);

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
