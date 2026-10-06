// Every route in the API, mounted under /api/v1 by app.js. Adding a resource
// means adding one line here.
const express = require('express');
const healthRoutes = require('./health.routes');
const provinceRoutes = require('./provinces.routes');
const districtRoutes = require('./districts.routes');
const substationRoutes = require('./substations.routes');
const installationRoutes = require('./installations.routes');

const router = express.Router();

router.use('/health', healthRoutes);
// The hierarchy: province -> district -> substation -> installation. Each child
// collection is reached through its parent, e.g. /provinces/WP/districts.
router.use('/provinces', provinceRoutes);
router.use('/districts', districtRoutes);
router.use('/substations', substationRoutes);
router.use('/installations', installationRoutes);

module.exports = router;
