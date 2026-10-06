const installationService = require('../services/installation.service');
const overviewService = require('../services/overview.service');
const { serializeInstallation, serializeReading, serializeReference } = require('../serializers');
const check = require('./query-params');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const { sendConditional, strongEtag, assertIfMatch } = require('../utils/conditional-get');
const validateBody = require('../utils/validate-body');
const { INSTALLATION, INSTALLATION_READ_ONLY } = require('./body-schemas');

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

// POST /substations/{substation_id}/installations (admin)
async function createInstallation(req, res) {
  parseQuery(req.query);
  const fields = validateBody(req.body, INSTALLATION, { readOnly: INSTALLATION_READ_ONLY });
  const { installation, deviceKey } = await installationService.createInstallation(
    req.user,
    req.params.substation_id,
    fields,
  );

  const representation = serializeInstallation(installation);
  res
    .status(201)
    .location(`/api/v1/installations/${installation.id}`)
    // The ETag is that of the installation as GET returns it (without the key),
    // so the client can use it in If-Match straight away.
    .set('ETag', strongEtag(representation))
    .set('Last-Modified', new Date(installation.updated_at).toUTCString())
    // The body holds the plaintext device key: no cache may keep a copy.
    .set('Cache-Control', 'no-store')
    // The only time the plaintext key is ever sent; it cannot be fetched again.
    .json({ ...representation, device_key: deviceKey });
}

// PUT and PATCH share everything except validation: PUT must send every
// editable field (a full replacement), PATCH only the ones to change.
function updateHandler({ partial }) {
  return async (req, res) => {
    parseQuery(req.query);
    const changes = validateBody(req.body, INSTALLATION, {
      partial,
      readOnly: INSTALLATION_READ_ONLY,
    });
    const { installation_id: installationId } = req.params;

    const current = await installationService.getInstallation(req.user, installationId);
    assertIfMatch(req, serializeInstallation(current));
    const updated = await installationService.updateInstallation(req.user, installationId, changes);
    // Sends the new ETag and Last-Modified with the updated resource.
    sendConditional(req, res, serializeInstallation(updated), updated.updated_at);
  };
}

// PUT /installations/{installation_id} (admin)
const replaceInstallation = updateHandler({ partial: false });

// PATCH /installations/{installation_id} (admin)
const patchInstallation = updateHandler({ partial: true });

// DELETE /installations/{installation_id} (admin)
async function deleteInstallation(req, res) {
  parseQuery(req.query);
  const { installation_id: installationId } = req.params;
  const current = await installationService.getInstallation(req.user, installationId);
  assertIfMatch(req, serializeInstallation(current));
  await installationService.deleteInstallation(req.user, installationId);
  res.status(204).end();
}

module.exports = {
  listInstallations,
  listInstallationsOnSubstation,
  getInstallation,
  getOverview,
  createInstallation,
  replaceInstallation,
  patchInstallation,
  deleteInstallation,
};
