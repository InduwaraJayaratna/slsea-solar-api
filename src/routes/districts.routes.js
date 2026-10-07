const express = require('express');
const districts = require('../controllers/districts.controller');
const substations = require('../controllers/substations.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');
const authenticateUser = require('../middleware/authenticate-user');

const router = express.Router();
// Provinces, districts and substations are reference data: read-only through
// the API, so any write method gets 405.
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/:district_id').get(authenticateUser, districts.getDistrict).all(readOnly);
router
  .route('/:district_id/substations')
  .get(authenticateUser, substations.listSubstationsInDistrict)
  .all(readOnly);

// A processing resource: computed from the district's readings on request.
router
  .route('/:district_id/generation-summary')
  .get(authenticateUser, districts.getGenerationSummary)
  .all(readOnly);

module.exports = router;
