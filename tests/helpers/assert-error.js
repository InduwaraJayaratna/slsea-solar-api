// Checks a response follows the API's error contract:
//   { "error": { "code": "<MACHINE_CODE>", "message": "<human text>", "details": [...] } }
const assert = require('node:assert/strict');

function assertError(res, status, code) {
  assert.equal(res.status, status);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.deepEqual(Object.keys(res.body), ['error']);
  assert.deepEqual(Object.keys(res.body.error), ['code', 'message', 'details']);
  assert.equal(res.body.error.code, code);
  assert.equal(typeof res.body.error.message, 'string');
  assert.ok(Array.isArray(res.body.error.details));
}

module.exports = assertError;
