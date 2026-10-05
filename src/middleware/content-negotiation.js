// The API only speaks JSON, in both directions.
const AppError = require('../utils/app-error');

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

function contentNegotiation(req, res, next) {
  // 406 if the client's Accept header rules out JSON. A missing Accept header
  // means "anything", so it passes.
  if (!req.accepts('application/json')) {
    return next(AppError.notAcceptable());
  }

  // 415 if a request body is sent in anything but JSON. An empty body has no
  // media type to check, so body-less requests (e.g. a POST action, often sent
  // with Content-Length: 0) are allowed through.
  const hasBody =
    req.get('Transfer-Encoding') !== undefined || Number(req.get('Content-Length')) > 0;
  if (METHODS_WITH_BODY.has(req.method) && hasBody && !req.is('application/json')) {
    return next(AppError.unsupportedMediaType());
  }

  next();
}

module.exports = contentNegotiation;
