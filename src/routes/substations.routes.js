const express = require('express');
const substations = require('../controllers/substations.controller');
const installations = require('../controllers/installations.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/:substation_id').get(substations.getSubstation).all(readOnly);
router
  .route('/:substation_id/installations')
  .get(installations.listInstallationsOnSubstation)
  .all(readOnly);

module.exports = router;
