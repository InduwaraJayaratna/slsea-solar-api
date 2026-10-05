// Gives every request an id, echoed in the X-Request-Id response header and
// written to the logs, so a client's report can be matched to a log line.
const crypto = require('node:crypto');

// A caller-supplied id (e.g. from a gateway) is reused only if it is short and
// plain, so nothing odd can be injected into the logs.
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
