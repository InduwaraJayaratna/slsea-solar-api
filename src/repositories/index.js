// Chooses the repository implementation from the DATA_SOURCE setting. The rest
// of the app requires this file, never an implementation directly, so the data
// source can change without touching services, controllers or routes.
const config = require('../config');

// Each implementation is required only when selected, so unused ones (and their
// drivers) are never loaded.
const implementations = {
  memory: () => require('./memory'),
  mongo: () => require('./mongo'),
};

if (!implementations[config.dataSource]) {
  throw new Error(
    `Unknown DATA_SOURCE "${config.dataSource}". Expected one of: ${Object.keys(implementations).join(', ')}`,
  );
}

module.exports = implementations[config.dataSource]();
