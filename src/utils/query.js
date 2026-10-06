// Validates a request's query string against what an endpoint accepts. Every
// problem is collected first, so one 400 response lists all of them, each
// detail naming the parameter.
const AppError = require('./app-error');

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

// A positive whole number written plainly: "2" is fine; "02", "2.5", "-1" and "2abc" are not.
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

// options.filters maps each allowed filter name to a check that returns an
// error message, or null if the value is fine. options.paginated allows page
// and page_size. Any other parameter is rejected.
function parseQuery(query, { filters = {}, paginated = false } = {}) {
  const details = [];
  const problem = (parameter, message) => details.push({ parameter, message });
  const allowed = new Set(Object.keys(filters));
  if (paginated) {
    allowed.add('page');
    allowed.add('page_size');
  }

  for (const [parameter, value] of Object.entries(query)) {
    if (!allowed.has(parameter)) {
      problem(parameter, 'is not a supported query parameter');
    } else if (typeof value !== 'string') {
      // Express turns ?a=1&a=2 into an array; each parameter may appear once.
      problem(parameter, 'must be given once');
    }
  }

  const result = { filters: {} };
  for (const [name, check] of Object.entries(filters)) {
    const value = query[name];
    if (typeof value !== 'string') continue;
    const message = check(value);
    if (message) problem(name, message);
    else result.filters[name] = value;
  }

  if (paginated) {
    result.page = 1;
    result.page_size = DEFAULT_PAGE_SIZE;
    if (typeof query.page === 'string') {
      if (POSITIVE_INTEGER.test(query.page)) result.page = Number(query.page);
      else problem('page', 'must be a whole number of at least 1');
    }
    if (typeof query.page_size === 'string') {
      const size = Number(query.page_size);
      if (POSITIVE_INTEGER.test(query.page_size) && size <= MAX_PAGE_SIZE) result.page_size = size;
      else problem('page_size', `must be a whole number from 1 to ${MAX_PAGE_SIZE}`);
    }
  }

  if (details.length > 0) throw AppError.badRequest('Invalid query parameters', details);
  return result;
}

module.exports = { parseQuery };
