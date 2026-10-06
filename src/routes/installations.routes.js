const express = require('express');
const installations = require('../controllers/installations.controller');
const readings = require('../controllers/readings.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/').get(installations.listInstallations).all(readOnly);
router.route('/:installation_id').get(installations.getInstallation).all(readOnly);
router.route('/:installation_id/overview').get(installations.getOverview).all(readOnly);
// last-reading is a derived resource (the latest reading), not a filter on the
// readings collection.
router.route('/:installation_id/last-reading').get(readings.getLastReading).all(readOnly);
router.route('/:installation_id/readings').get(readings.listInstallationReadings).all(readOnly);
router
  .route('/:installation_id/readings/:reading_id')
  .get(readings.getInstallationReading)
  .all(readOnly);

module.exports = router;
