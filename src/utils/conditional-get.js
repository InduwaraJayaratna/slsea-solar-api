// Conditional GET, implemented once for every retrievable resource and collection.
//
// Each response carries two validators:
//   ETag          - a hash of the exact response body, so it changes whenever
//                   the body changes (a strong ETag: same bytes, same tag).
//   Last-Modified - when the data last changed (updated_at), if the data has
//                   that timestamp.
// A client that sends one back (If-None-Match / If-Modified-Since) and still has
// the current version gets 304 Not Modified with no body, which saves sending
// the data again.
const crypto = require('node:crypto');

function sendConditional(req, res, body, lastModified) {
  const json = JSON.stringify(body);
  const etag = `"${crypto.createHash('sha256').update(json).digest('base64url')}"`;

  res.set('ETag', etag);
  if (lastModified) res.set('Last-Modified', new Date(lastModified).toUTCString());
  // private: only the client may cache it (responses will depend on who asks).
  // no-cache: the client may keep a copy but must revalidate before using it.
  res.set('Cache-Control', 'private, no-cache');

  // req.fresh (Express, via the `fresh` package) compares the request's
  // If-None-Match / If-Modified-Since with the headers set above. Per RFC 9110,
  // If-None-Match wins when both are sent.
  if (req.fresh) return res.status(304).end();

  res.type('application/json').send(json);
}

module.exports = sendConditional;
