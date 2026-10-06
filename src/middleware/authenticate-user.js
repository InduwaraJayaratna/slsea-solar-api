// Read clients (SLSEA users) authenticate with a Bearer access token:
//   Authorization: Bearer <jwt>
// On success req.user = { id, role, province_id, district_id }, taken from the
// token itself, so no database lookup is needed.
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/app-error');

const ROLES = ['admin', 'national', 'provincial', 'district'];

// RFC 6750: error="invalid_token" tells the client to get a new token.
const INVALID_TOKEN_CHALLENGE = 'Bearer realm="slsea-solar-api", error="invalid_token"';

function authenticateUser(req, res, next) {
  const header = req.get('Authorization');
  if (!header) {
    return next(AppError.unauthorized('Send an access token: Authorization: Bearer <token>'));
  }

  const [scheme, token, extra] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer' || !token || extra !== undefined) {
    return next(
      AppError.unauthorized(
        'Authorization header must be: Bearer <token>',
        [],
        INVALID_TOKEN_CHALLENGE,
      ),
    );
  }

  let claims;
  try {
    // Only HS256 is accepted: a token claiming another algorithm (including
    // "none", i.e. unsigned) is rejected instead of trusted.
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError' ? 'Access token has expired' : 'Access token is invalid';
    return next(AppError.unauthorized(message, [], INVALID_TOKEN_CHALLENGE));
  }

  // A correctly signed token is still checked for the claims the API relies on.
  if (!claims.sub || !ROLES.includes(claims.role)) {
    return next(AppError.unauthorized('Access token is invalid', [], INVALID_TOKEN_CHALLENGE));
  }

  req.user = {
    id: claims.sub,
    role: claims.role,
    province_id: claims.province_id ?? null,
    district_id: claims.district_id ?? null,
  };
  next();
}

module.exports = authenticateUser;
