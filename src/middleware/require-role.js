// Allows only users with one of the given roles; anyone else gets 403. Runs
// after authenticateUser, which sets req.user.
const AppError = require('../utils/app-error');

function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.user.role)) return next();
    next(AppError.forbidden(`This action needs the ${roles.join(' or ')} role`));
  };
}

module.exports = requireRole;
