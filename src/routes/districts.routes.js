const express = require('express');
const districts = require('../controllers/districts.controller');
const substations = require('../controllers/substations.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/:district_id').get(districts.getDistrict).all(readOnly);
router.route('/:district_id/substations').get(substations.listSubstationsInDistrict).all(readOnly);

module.exports = router;
