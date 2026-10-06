// Builds the Express app without starting a server, so tests can call it
// directly with supertest. src/server.js does the listening.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const requestId = require('./middleware/request-id');
const requestLogger = require('./middleware/request-logger');
const contentNegotiation = require('./middleware/content-negotiation');
const notFound = require('./middleware/not-found');
const errorHandler = require('./middleware/error-handler');
const routes = require('./routes');

const app = express();

// Don't advertise the framework in an X-Powered-By header.
app.disable('x-powered-by');
// Express's automatic ETags are switched off; the API sets its own ETags.
app.set('etag', false);

// Order matters: each request passes through these from top to bottom.
app.use(requestId); // first, so every later step (and log line) has the id
app.use(requestLogger);
// Security headers (e.g. X-Content-Type-Options: nosniff, Strict-Transport-Security).
app.use(helmet());
// Lets browser apps on other origins call the API. It also answers CORS
// preflight (OPTIONS) requests, so it runs before content negotiation.
// exposedHeaders lets browser code read these response headers.
app.use(
  cors({
    origin: config.corsOrigin,
    exposedHeaders: ['ETag', 'Last-Modified', 'Link', 'X-Request-Id', 'WWW-Authenticate'],
  }),
);
app.use(express.json({ limit: config.bodyLimit }));
app.use(contentNegotiation);
app.use('/api/v1', routes);
app.use(notFound); // nothing above matched the path
app.use(errorHandler); // last: turns every error into the error contract

module.exports = app;
