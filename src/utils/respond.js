// The two ways a GET responds: a single resource as a bare JSON object, or a
// page of a collection in the { data, pagination, links } envelope. Both go
// through sendConditional, so every GET supports ETag and 304.
const sendConditional = require('./conditional-get');
const { buildCollectionBody } = require('./pagination');

function sendResource(req, res, record, serialize) {
  sendConditional(req, res, serialize(record), record.updated_at);
}

// `page` is a service result ({ items, total, lastModified }); `query` is the
// parsed query holding page and page_size.
function sendCollection(req, res, page, query, serialize) {
  const { body, linkHeader } = buildCollectionBody(req, page.items.map(serialize), {
    total: page.total,
    page: query.page,
    page_size: query.page_size,
  });
  if (linkHeader) res.set('Link', linkHeader);
  sendConditional(req, res, body, page.lastModified);
}

module.exports = { sendResource, sendCollection };
