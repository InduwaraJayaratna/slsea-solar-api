const substationService = require('../services/substation.service');
const { serializeSubstation } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');
const AppError = require('../utils/app-error');

// GET /districts/{district_id}/substations
async function listSubstationsInDistrict(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await substationService.listSubstationsInDistrict(req.params.district_id, query);
  if (!page) throw AppError.notFound(`District "${req.params.district_id}" not found`);
  sendCollection(req, res, page, query, serializeSubstation);
}

async function getSubstation(req, res) {
  parseQuery(req.query);
  const substation = await substationService.getSubstation(req.params.substation_id);
  if (!substation) {
    throw AppError.notFound(`Substation "${req.params.substation_id}" not found`);
  }
  sendResource(req, res, substation, serializeSubstation);
}

module.exports = { listSubstationsInDistrict, getSubstation };
