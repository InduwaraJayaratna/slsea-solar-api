// Write clients (metering devices) authenticate with their device key:
//   X-Device-Key: <key>
// The key must belong to the installation named in the URL
// (:installation_id). On success req.device = { installation_id }.
//
// Only the SHA-256 hash of each key is stored. Device keys are long random
// values, so a fast hash is safe here (unlike passwords, which need bcrypt).
const crypto = require('node:crypto');
const repositories = require('../repositories');
const AppError = require('../utils/app-error');

// Device keys are not Bearer tokens, so the 401 names the header to send.
const DEVICE_CHALLENGE = 'DeviceKey realm="slsea-solar-api", header="X-Device-Key"';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest();

async function authenticateDevice(req, res, next) {
  // Only X-Device-Key is read; a user's Authorization header is ignored, so a
  // user token can never pass as a device.
  const key = req.get('X-Device-Key');
  if (!key)
    throw AppError.unauthorized('Send the device key in X-Device-Key', [], DEVICE_CHALLENGE);

  const installationId = req.params.installation_id;
  const installation = await repositories.installations.findById(installationId);
  if (!installation) throw AppError.notFound(`Installation "${installationId}" not found`);

  // timingSafeEqual takes the same time however many bytes match, so response
  // times leak nothing about the stored hash. Both are 32-byte SHA-256 digests.
  const presented = sha256(key);
  const stored = Buffer.from(installation.device_key_hash, 'hex');
  if (stored.length === presented.length && crypto.timingSafeEqual(presented, stored)) {
    req.device = { installation_id: installationId };
    return next();
  }

  // Wrong key for this installation. If it is a real key for another one, the
  // device is known but not allowed here: 403. Otherwise it is not a key: 401.
  const owners = await repositories.installations.findAll({
    device_key_hash: presented.toString('hex'),
  });
  if (owners.length > 0) {
    throw AppError.forbidden(`This device key is not for installation "${installationId}"`);
  }
  throw AppError.unauthorized('Device key is invalid', [], DEVICE_CHALLENGE);
}

module.exports = authenticateDevice;
