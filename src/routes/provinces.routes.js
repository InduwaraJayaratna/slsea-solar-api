const express = require('express');
const provinces = require('../controllers/provinces.controller');
const districts = require('../controllers/districts.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');
const authenticateUser = require('../middleware/authenticate-user');

const router = express.Router();
// Provinces, districts and substations are reference data: read-only through
// the API, so any write method gets 405.
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/').get(authenticateUser, provinces.listProvinces).all(readOnly);
router.route('/:province_id').get(authenticateUser, provinces.getProvince).all(readOnly);
router
  .route('/:province_id/districts')
  .get(authenticateUser, districts.listDistrictsInProvince)
  .all(readOnly);

module.exports = router;
