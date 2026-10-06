const express = require('express');
const installations = require('../controllers/installations.controller');
const methodNotAllowed = require('../middleware/method-not-allowed');

const router = express.Router();
const readOnly = methodNotAllowed(['GET', 'HEAD']);

router.route('/').get(installations.listInstallations).all(readOnly);
router.route('/:installation_id').get(installations.getInstallation).all(readOnly);

module.exports = router;
