// Reached only when no route matched the path: 404 in the standard error format.
const AppError = require('../utils/app-error');

function notFound(req, res, next) {
  next(AppError.notFound(`No resource at ${req.method} ${req.path}`));
}

module.exports = notFound;
