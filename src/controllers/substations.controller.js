const substationService = require('../services/substation.service');
const { serializeSubstation } = require('../serializers');
const { parseQuery } = require('../utils/query');
const { sendResource, sendCollection } = require('../utils/respond');

// GET /districts/{district_id}/substations
async function listSubstationsInDistrict(req, res) {
  const query = parseQuery(req.query, { paginated: true });
  const page = await substationService.listSubstationsInDistrict(
    req.user,
    req.params.district_id,
    query,
  );
  sendCollection(req, res, page, query, serializeSubstation);
}

async function getSubstation(req, res) {
  parseQuery(req.query);
  const substation = await substationService.getSubstation(req.user, req.params.substation_id);
  sendResource(req, res, substation, serializeSubstation);
}

module.exports = { listSubstationsInDistrict, getSubstation };
