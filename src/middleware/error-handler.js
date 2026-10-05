// The single place errors become HTTP responses, so every error in the API has
// the same shape:
//   { "error": { "code": "<MACHINE_CODE>", "message": "<human text>", "details": [...] } }
const AppError = require('../utils/app-error');

// Errors raised by express.json() carry a `type`; map them to the contract.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': () => AppError.badRequest('Request body is not valid JSON'),
  'entity.too.large': () => AppError.payloadTooLarge(),
  'encoding.unsupported': () => AppError.unsupportedMediaType('Unsupported content encoding'),
  'charset.unsupported': () => AppError.unsupportedMediaType('Unsupported charset'),
};

function toAppError(err) {
  if (err instanceof AppError) return err;
  if (BODY_PARSER_ERRORS[err.type]) return BODY_PARSER_ERRORS[err.type]();
  return AppError.internal();
}

// Express recognises error handlers by their four parameters, so `next` must stay.
function errorHandler(err, req, res, next) {
  const error = toAppError(err);

  // Unexpected errors are logged in full on the server, but the client only
  // gets a generic message: a stack trace would reveal how the code works.
  if (error.status >= 500) {
    console.error(`[${req.id}] ${err.stack || err}`);
  }

  // If the response has already started, Express must close the connection.
  if (res.headersSent) return next(err);

  res
    .status(error.status)
    .set(error.headers)
    .json({ error: { code: error.code, message: error.message, details: error.details } });
}

module.exports = errorHandler;
