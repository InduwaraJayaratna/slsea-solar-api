// All configuration in one place, read from environment variables (and .env,
// if present). The rest of the code reads config from here, never process.env.
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const { version } = require('../../package.json');

// `||` rather than `??` so an empty value in .env (as in .env.example) falls
// back to the default.
module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  dataSource: process.env.DATA_SOURCE || 'memory',
  bodyLimit: process.env.BODY_LIMIT || '100kb',
  version,
};
