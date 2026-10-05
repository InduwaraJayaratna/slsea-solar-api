// Placed after a route's handlers with .all(): any method the route did not
// handle gets 405 with an Allow header listing the ones it does.
const AppError = require('../utils/app-error');

function methodNotAllowed(allowed) {
  return (req, res, next) => next(AppError.methodNotAllowed(req.method, allowed));
}

module.exports = methodNotAllowed;
