const express = require('express');
const installations = require('../controllers/installations.controller');
const readings = require('../controllers/readings.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');
const authenticateUser = require('../middleware/authenticate-user');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/').get(authenticateUser, installations.listInstallations).all(readOnly);
router
  .route('/:installation_id')
  .get(authenticateUser, installations.getInstallation)
  .all(readOnly);
router
  .route('/:installation_id/overview')
  .get(authenticateUser, installations.getOverview)
  .all(readOnly);
// last-reading is a derived resource (the latest reading), not a filter on the
// readings collection.
router
  .route('/:installation_id/last-reading')
  .get(authenticateUser, readings.getLastReading)
  .all(readOnly);
router
  .route('/:installation_id/readings')
  .get(authenticateUser, readings.listInstallationReadings)
  .all(readOnly);
router
  .route('/:installation_id/readings/:reading_id')
  .get(authenticateUser, readings.getInstallationReading)
  .all(readOnly);

module.exports = router;
