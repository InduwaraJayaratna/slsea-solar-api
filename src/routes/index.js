// Every route in the API, mounted under /api/v1 by app.js. Adding a resource
// means adding one entry to MOUNTS.
const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const provinceRoutes = require('./provinces.routes');
const districtRoutes = require('./districts.routes');
const substationRoutes = require('./substations.routes');
const installationRoutes = require('./installations.routes');
const readingRoutes = require('./readings.routes');

// [path, router] pairs. Kept as data (not only router.use calls) because
// Express 5 does not record a router's mount path, and the documentation test
// needs every full path to compare with the OpenAPI spec.
const MOUNTS = [
  // Open: no authentication.
  ['/health', healthRoutes],
  ['/auth', authRoutes],
  // Every GET below requires a user access token (authenticateUser, applied
  // per route, so a device write route on the same path can use device auth).
  // The hierarchy: province -> district -> substation -> installation. Each
  // child collection is reached through its parent, e.g. /provinces/WP/districts.
  ['/provinces', provinceRoutes],
  ['/districts', districtRoutes],
  ['/substations', substationRoutes],
  ['/installations', installationRoutes],
  // Readings across the estate; one installation's readings live under it.
  ['/readings', readingRoutes],
];

const router = express.Router();
for (const [path, routes] of MOUNTS) router.use(path, routes);

module.exports = { router, MOUNTS };
