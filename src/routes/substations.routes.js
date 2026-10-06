const express = require('express');
const substations = require('../controllers/substations.controller');
const installations = require('../controllers/installations.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');
const authenticateUser = require('../middleware/authenticate-user');
const requireRole = require('../middleware/require-role');

const router = express.Router();
// Provinces, districts and substations are reference data: read-only through
// the API, so any write method gets 405.
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/:substation_id').get(authenticateUser, substations.getSubstation).all(readOnly);
// New installations are created on their substation (admin only).
router
  .route('/:substation_id/installations')
  .get(authenticateUser, installations.listInstallationsOnSubstation)
  .post(authenticateUser, requireRole('admin'), installations.createInstallation)
  .all(methodNotAllowed(['GET', 'HEAD', 'POST']));

module.exports = router;
