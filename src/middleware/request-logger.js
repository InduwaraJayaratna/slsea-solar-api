// One log line per request, with the request id. Turned off in tests to keep
// test output readable. Only the method and URL are logged, never headers or
// bodies, so tokens and passwords cannot end up in the logs.
const morgan = require('morgan');
const config = require('../config');

morgan.token('id', (req) => req.id);

module.exports = morgan(':id :method :url :status :res[content-length] - :response-time ms', {
  skip: () => config.env === 'test',
});
