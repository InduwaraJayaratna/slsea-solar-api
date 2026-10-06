const installationService = require('../services/installation.service');
const { serializeInstallation } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const AppError = require('../utils/app-error');

const STATUSES = ['active', 'inactive', 'maintenance'];

// A filter check that accepts values matching `pattern`.
const matches = (pattern, message) => (value) => (pattern.test(value) ? null : message);

// Filters for GET /installations. Values are checked for form, not existence:
// a well-formed id that matches nothing simply returns an empty page.
const INSTALLATION_FILTERS = {
  province_id: matches(/^[A-Z]{2}$/, 'must be a province id such as WP'),
  district_id: matches(/^[A-Z]{3}$/, 'must be a district id such as COL'),
  substation_id: matches(/^SUB-[0-9]+$/, 'must be a substation id such as SUB-001'),
  status: (value) => (STATUSES.includes(value) ? null : `must be one of ${STATUSES.join(', ')}`),
};

// GET /installations
async function listInstallations(req, res) {
  const query = parseQuery(req.query, { paginated: true, filters: INSTALLATION_FILTERS });
  const page = await installationService.listInstallations(query.filters, query);
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

module.exports = { listInstallations, listInstallationsOnSubstation, getInstallation };
