const express = require('express');
const healthController = require('../controllers/health.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();

// Express answers HEAD with the GET handler, so both are allowed.
router
  .route('/')
  .get(healthController.getHealth)
  .all(methodNotAllowed(['GET', 'HEAD']));

module.exports = router;
