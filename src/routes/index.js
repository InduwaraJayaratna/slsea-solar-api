// Every route in the API, mounted under /api/v1 by app.js. Adding a resource
// means adding one line here.
const express = require('express');
const healthRoutes = require('./health.routes');

const router = express.Router();

router.use('/health', healthRoutes);

module.exports = router;
