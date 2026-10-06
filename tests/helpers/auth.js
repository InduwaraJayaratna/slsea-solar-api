// Access tokens for tests. Tokens are signed directly (no bcrypt login per
// test), with the same function the login endpoint uses.
require('./test-env');
const { issueToken } = require('../../src/services/auth.service');
const seedUsers = require('../../data/seed/users.json');

// "Bearer <token>" for a seed user, e.g. bearer('admin') or bearer('dist.col').
function bearer(username) {
  const user = seedUsers.find((u) => u.username === username);
  if (!user) throw new Error(`No seed user "${username}"`);
  return `Bearer ${issueToken(user)}`;
}

module.exports = { bearer };
