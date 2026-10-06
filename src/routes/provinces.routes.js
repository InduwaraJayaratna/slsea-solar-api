const express = require('express');
const provinces = require('../controllers/provinces.controller');
const districts = require('../controllers/districts.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/').get(provinces.listProvinces).all(readOnly);
router.route('/:province_id').get(provinces.getProvince).all(readOnly);
router.route('/:province_id/districts').get(districts.listDistrictsInProvince).all(readOnly);

module.exports = router;
