// Loads the app for tests. NODE_ENV=test must be set before the app (and its
// config) is first required; it turns off request logging. node --test runs
// each test file in its own process, so this does not leak between files.
process.env.NODE_ENV = 'test';

module.exports = require('../../src/app');
