// Signing in SLSEA users: check a username and password, issue an access token.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const repositories = require('../repositories');

// Compared against when the username does not exist, so an unknown user takes
// as long to reject as a wrong password. Otherwise response time would reveal
// which usernames exist.
const DUMMY_HASH = bcrypt.hashSync('no-such-user', 10);

// The token carries the user's role and jurisdiction, so checking access on
// each request needs no database lookup.
function issueToken(user) {
  const claims = {
    role: user.role,
    province_id: user.province_id,
    district_id: user.district_id,
  };
  return jwt.sign(claims, config.jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
  });
}

// Returns { access_token, expires_in }, or null if the credentials are wrong.
// Wrong username and wrong password give the same null, so callers cannot
// tell which one it was.
async function login(username, password) {
  const [user] = await repositories.users.findAll({ username });
  const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordMatches) return null;

  const token = issueToken(user);
  const { iat, exp } = jwt.decode(token);
  return { access_token: token, expires_in: exp - iat };
}

module.exports = { login, issueToken };
