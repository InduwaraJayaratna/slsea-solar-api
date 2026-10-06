// The one pagination helper every collection uses.
//
// paginate() is used by services: it cuts one page out of the matching records.
// buildCollectionBody() is used by controllers: it wraps that page in the
// collection envelope { data, pagination, links } and builds the Link header.

// Returns one page of `records`, the total number of matches, and the newest
// updated_at among all matches (null if the records have no updated_at). The
// newest timestamp covers every match, not just this page, so adding or editing
// any match changes the collection's Last-Modified.
function paginate(records, { page, page_size: pageSize }) {
  const start = (page - 1) * pageSize;
  const timestamps = records.map((record) => record.updated_at).filter(Boolean);
  return {
    items: records.slice(start, start + pageSize),
    total: records.length,
    // ISO 8601 UTC strings of one format sort correctly as text.
    lastModified: timestamps.length > 0 ? timestamps.sort().at(-1) : null,
  };
}

// URL of `page`, keeping every other query parameter the client sent (filters).
// Links are relative to the host, so they work behind any proxy or domain.
function pageUrl(req, page, pageSize) {
  const params = new URLSearchParams(req.query);
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return `${req.originalUrl.split('?')[0]}?${params}`;
}

function buildCollectionBody(req, data, { total, page, page_size: pageSize }) {
  const totalPages = Math.ceil(total / pageSize);
  const lastPage = Math.max(totalPages, 1); // an empty collection still has page 1
  const links = {
    self: pageUrl(req, page, pageSize),
    first: pageUrl(req, 1, pageSize),
    last: pageUrl(req, lastPage, pageSize),
    next: page < totalPages ? pageUrl(req, page + 1, pageSize) : null,
    // A page past the end points back to the last real page.
    prev: page > 1 ? pageUrl(req, Math.min(page - 1, lastPage), pageSize) : null,
  };

  // RFC 8288 Link header, so clients can page without reading the body.
  const linkHeader = [
    links.next && `<${links.next}>; rel="next"`,
    links.prev && `<${links.prev}>; rel="prev"`,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    body: {
      data,
      pagination: { total, page, page_size: pageSize, total_pages: totalPages },
      links,
    },
    linkHeader,
  };
}

module.exports = { paginate, buildCollectionBody };
