// Conditional requests, implemented once for every resource and collection:
// conditional GET (304 Not Modified) and, for writes, If-Match (412).
//
// Each response carries two validators:
//   ETag          - a hash of the exact response body, so it changes whenever
//                   the body changes (a strong ETag: same bytes, same tag),
//                   or a weak ETag for clock-dependent bodies (see below).
//   Last-Modified - when the data last changed (updated_at), if the data has
//                   that timestamp.
// A client that sends one back (If-None-Match / If-Modified-Since) and still has
// the current version gets 304 Not Modified with no body, which saves sending
// the data again.
const crypto = require('node:crypto');

const AppError = require('./app-error');

const hash = (text) => crypto.createHash('sha256').update(text).digest('base64url');

// The strong ETag of a JSON body: what a GET of that representation sends.
const strongEtag = (body) => `"${hash(JSON.stringify(body))}"`;

// options.weakEtagFrom: for a body that changes with the clock (e.g. a reading's
// age in seconds), hash only the parts that matter instead and send a weak ETag
// (W/"..."), which says "equivalent", not "byte-identical". Without it, every
// request would get a new ETag and 304 could never happen.
function sendConditional(req, res, body, lastModified, { weakEtagFrom } = {}) {
  const json = JSON.stringify(body);
  const etag = weakEtagFrom ? `W/"${hash(JSON.stringify(weakEtagFrom))}"` : strongEtag(body);

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

// Optimistic concurrency for writes (PUT, PATCH, DELETE). A client sends
// If-Match with the ETag it last read; if the resource has changed since, its
// current ETag differs and the write is refused with 412, instead of silently
// overwriting someone else's change. `currentBody` is the resource's current
// representation (what a GET would return).
//
// No If-Match header: the write goes ahead. "*" matches any existing resource.
// RFC 9110 requires strong comparison for If-Match, so a weak W/"..." tag
// never matches.
function assertIfMatch(req, currentBody) {
  const header = req.get('If-Match');
  if (!header || header.trim() === '*') return;
  const tags = header.split(',').map((tag) => tag.trim());
  if (!tags.includes(strongEtag(currentBody))) {
    throw AppError.preconditionFailed(
      'The resource has changed since you read it: fetch it again and retry with the new ETag',
    );
  }
}

module.exports = { sendConditional, strongEtag, assertIfMatch };
