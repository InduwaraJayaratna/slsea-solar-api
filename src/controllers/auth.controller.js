const authService = require('../services/auth.service');
const { LOGIN } = require('./body-schemas');
const { parseQuery } = require('../utils/query');
const validateBody = require('../utils/validate-body');
const AppError = require('../utils/app-error');

// POST /auth/tokens with { "username", "password" }: issue an access token.
async function createToken(req, res) {
  parseQuery(req.query);
  const { username, password } = validateBody(req.body, LOGIN);

  const result = await authService.login(username, password);
  // One message for both cases, so it does not reveal whether the username exists.
  if (!result) throw AppError.unauthorized('Invalid username or password');

  // RFC 6749: responses carrying tokens must not be stored by any cache.
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    access_token: result.access_token,
    token_type: 'Bearer',
    expires_in: result.expires_in,
  });
}

module.exports = { createToken };
