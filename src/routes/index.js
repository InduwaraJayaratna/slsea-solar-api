// Every route in the API, mounted under /api/v1 by app.js. Adding a resource
// means adding one line here.
const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const provinceRoutes = require('./provinces.routes');
const districtRoutes = require('./districts.routes');
const substationRoutes = require('./substations.routes');
const installationRoutes = require('./installations.routes');
const readingRoutes = require('./readings.routes');

const router = express.Router();

// Open: no authentication.
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Every GET below requires a user access token (authenticateUser, applied per
// route so a future device write route on the same path can use device auth).

// The hierarchy: province -> district -> substation -> installation. Each child
// collection is reached through its parent, e.g. /provinces/WP/districts.
router.use('/provinces', provinceRoutes);
router.use('/districts', districtRoutes);
router.use('/substations', substationRoutes);
router.use('/installations', installationRoutes);
// Readings across the estate; one installation's readings live under it.
router.use('/readings', readingRoutes);

module.exports = router;
