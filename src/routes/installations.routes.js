const express = require('express');
const installations = require('../controllers/installations.controller');
const readings = require('../controllers/readings.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');
const authenticateUser = require('../middleware/authenticate-user');
const authenticateDevice = require('../middleware/authenticate-device');
const requireRole = require('../middleware/require-role');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);
// Managing installations is for admins only; other roles get 403.
const adminOnly = [authenticateUser, requireRole('admin')];

router.route('/').get(authenticateUser, installations.listInstallations).all(readOnly);
router
  .route('/:installation_id')
  .get(authenticateUser, installations.getInstallation)
  .put(...adminOnly, installations.replaceInstallation)
  .patch(...adminOnly, installations.patchInstallation)
  .delete(...adminOnly, installations.deleteInstallation)
  .all(methodNotAllowed(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']));
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

// Readings are append-only: a device may add one (POST, with its device key),
// but no one may change (PUT, PATCH) or delete (DELETE) a stored reading, so
// those get 405. Readings are measurements of what happened. Editing them would
// make history untrustworthy, and every total and report built on them
// unrepeatable. A wrong reading is corrected by the meter's next cumulative
// total, never by rewriting the past.
router
  .route('/:installation_id/readings')
  .get(authenticateUser, readings.listInstallationReadings)
  .post(authenticateDevice, readings.ingestReading)
  .all(methodNotAllowed(['GET', 'HEAD', 'POST']));
router
  .route('/:installation_id/readings/:reading_id')
  .get(authenticateUser, readings.getInstallationReading)
  .all(readOnly);

module.exports = router;
