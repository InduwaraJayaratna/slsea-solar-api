// The one error type the API throws on purpose. The central error handler turns
// it into the API's error contract:
//   { "error": { "code": "<MACHINE_CODE>", "message": "<human text>", "details": [...] } }
// `code` is stable for programs to check; `message` is for people and may change.
class AppError extends Error {
  constructor(status, code, message, details = [], headers = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    // Extra response headers this error needs, e.g. Allow on a 405.
    this.headers = headers;
  }

  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  // RFC 9110 requires a 401 to say how to authenticate, in WWW-Authenticate.
  static unauthorized(
    message = 'Authentication is required',
    details,
    challenge = 'Bearer realm="slsea-solar-api"',
  ) {
    return new AppError(401, 'UNAUTHORIZED', message, details, { 'WWW-Authenticate': challenge });
  }

  static forbidden(message = 'You do not have permission to do this', details) {
    return new AppError(403, 'FORBIDDEN', message, details);
  }

  static notFound(message = 'Resource not found', details) {
    return new AppError(404, 'NOT_FOUND', message, details);
  }

  // RFC 9110 requires a 405 response to list the allowed methods in Allow.
  static methodNotAllowed(method, allowed) {
    return new AppError(
      405,
      'METHOD_NOT_ALLOWED',
      `${method} is not allowed on this resource`,
      [],
      { Allow: allowed.join(', ') },
    );
  }

  static notAcceptable(message = 'This API only produces application/json', details) {
    return new AppError(406, 'NOT_ACCEPTABLE', message, details);
  }

  static conflict(message, details) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static preconditionFailed(message = 'The resource has changed since you last read it', details) {
    return new AppError(412, 'PRECONDITION_FAILED', message, details);
  }

  static payloadTooLarge(message = 'Request body is too large', details) {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message, details);
  }

  static unsupportedMediaType(message = 'Request body must be application/json', details) {
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message, details);
  }

  static internal() {
    return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

module.exports = AppError;
