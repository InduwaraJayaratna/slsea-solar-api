// AWS Lambda entry point: the same Express app as src/server.js (the local
// entry point), wrapped by serverless-http. API Gateway (HTTP API) turns each
// HTTP request into a Lambda event; serverless-http turns that event into a
// normal Node request for Express, and Express's response back into the
// object API Gateway expects.
//
// serverless-http also copies API Gateway's request id into the X-Request-Id
// request header (unless the client sent one), so the request-id middleware
// reuses it: the id in the response, the app's log line and API Gateway's own
// records are the same.
const serverless = require('serverless-http');
const app = require('./app');
const config = require('./config');

const handleWithExpress = serverless(app, {
  // API Gateway carries bodies as text, so binary responses must be base64
  // encoded. Only Swagger UI's favicons are binary; the API itself is JSON.
  binary: ['image/*', 'font/*'],
});

// The JSON error body (the API's error contract) sent when MongoDB cannot be
// reached. Express is not involved, so it is written out here.
const unavailable = {
  statusCode: 503,
  headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '5' },
  body: JSON.stringify({
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The database is unreachable; try again shortly',
      details: [],
    },
  }),
};

async function handler(event, context) {
  if (config.dataSource === 'mongo') {
    // connect() returns the same promise on every call, so only the first
    // event in a new container (a cold start) waits for the connection; later
    // events in the same warm container reuse it. If connecting fails, the
    // promise is forgotten and the next event tries again.
    try {
      await require('./config/db').connect();
    } catch (error) {
      // Only the message: some driver errors include connection details.
      console.error(`MongoDB connection failed: ${error.message}`);
      return unavailable;
    }
  }
  return handleWithExpress(event, context);
}

module.exports = { handler };
