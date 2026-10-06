// All configuration in one place, read from environment variables (and .env,
// if present). The rest of the code reads config from here, never process.env.
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const { version } = require('../../package.json');

const env = process.env.NODE_ENV || 'development';

// The JWT signing secret must come from the environment, never the code. The
// one exception is the test environment, which gets a fixed throwaway secret so
// tests run without a .env file.
const jwtSecret = process.env.JWT_SECRET || (env === 'test' ? 'test-only-secret-'.repeat(2) : '');

// Fail fast: refuse to start rather than run with no secret or a weak one.
// HS256 needs a key of at least 256 bits (32 bytes).
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters (see .env.example)');
}

// `||` rather than `??` so an empty value in .env (as in .env.example) falls
// back to the default.
module.exports = {
  env,
  port: Number(process.env.PORT || 3000),
  dataSource: process.env.DATA_SOURCE || 'memory',
  bodyLimit: process.env.BODY_LIMIT || '100kb',
  jwtSecret,
  // Token lifetime, in jsonwebtoken's format: seconds, or a string like "1h".
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  // Origins browsers may call the API from; "*" allows any. Tokens travel in the
  // Authorization header, not cookies, so "*" does not expose sessions.
  corsOrigin: process.env.CORS_ORIGIN || '*',
  version,
};
