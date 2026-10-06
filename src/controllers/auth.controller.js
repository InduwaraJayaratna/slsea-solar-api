const authService = require('../services/auth.service');
const { parseQuery } = require('../utils/query');
const AppError = require('../utils/app-error');

const FIELDS = ['username', 'password'];

// POST /auth/tokens with { "username", "password" }: issue an access token.
async function createToken(req, res) {
  parseQuery(req.query);

  const body = req.body;
  const details = [];
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    details.push({ field: 'body', message: 'must be a JSON object' });
  } else {
    for (const field of FIELDS) {
      if (typeof body[field] !== 'string' || body[field] === '') {
        details.push({ field, message: 'is required and must be a non-empty string' });
      }
    }
    for (const field of Object.keys(body)) {
      if (!FIELDS.includes(field)) details.push({ field, message: 'is not a supported field' });
    }
  }
  if (details.length > 0) throw AppError.badRequest('Invalid request body', details);

  const result = await authService.login(body.username, body.password);
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
