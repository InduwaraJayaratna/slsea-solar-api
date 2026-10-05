// HTTP side of the health check. Express 5 passes errors from async handlers
// to the error handler automatically, so no try/catch is needed.
const healthService = require('../services/health.service');

async function getHealth(req, res) {
  res.status(200).json(await healthService.getHealth());
}

module.exports = { getHealth };
