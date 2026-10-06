const express = require('express');
const readings = require('../controllers/readings.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');
const authenticateUser = require('../middleware/authenticate-user');

const router = express.Router();

router
  .route('/')
  .get(authenticateUser, readings.listReadings)
  .all(methodNotAllowed(['GET', 'HEAD']));

module.exports = router;
