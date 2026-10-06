const express = require('express');
const readings = require('../controllers/readings.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();

router
  .route('/')
  .get(readings.listReadings)
  .all(methodNotAllowed(['GET', 'HEAD']));

module.exports = router;
