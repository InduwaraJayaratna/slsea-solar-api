const express = require('express');
const authController = require('../controllers/auth.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();

// Creating a token is how a user signs in, so it needs no token itself.
router
  .route('/tokens')
  .post(authController.createToken)
  .all(methodNotAllowed(['POST']));

module.exports = router;
