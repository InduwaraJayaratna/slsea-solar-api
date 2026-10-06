const crypto = require('node:crypto');
const repositories = require('../repositories');
const { DuplicateKeyError } = require('../repositories/errors');
const clock = require('../utils/clock');
const { toIsoUtc } = require('../utils/iso-8601');
const { paginate } = require('../utils/pagination');
const { scopeOf, assertAccess, locationOf, assertFiltersAccessible } = require('./jurisdiction');
const { getSubstation } = require('./substation.service');
const AppError = require('../utils/app-error');

// Installations across the estate. Explicit filters outside the user's
// jurisdiction are refused (403); then the result is narrowed to it.
// `filters` holds only the filters the client sent (province_id, district_id,
// substation_id, status).
async function listInstallations(user, filters, paging) {
  await assertFiltersAccessible(user, filters);
  return paginate(
    await repositories.installations.findAll({ ...filters, ...scopeOf(user) }),
    paging,
  );
}

// The installations on one substation; 404/403 come from the substation check.
async function listInstallationsOnSubstation(user, substationId, paging) {
  await getSubstation(user, substationId);
  return paginate(
    await repositories.installations.findAll({ substation_id: substationId }),
    paging,
  );
}

async function getInstallation(user, installationId) {
  const installation = await repositories.installations.findById(installationId);
  if (!installation) throw AppError.notFound(`Installation "${installationId}" not found`);
  assertAccess(user, locationOf.installation(installation), `Installation "${installationId}"`);
  return installation;
}

// A DuplicateKeyError from the repository becomes 409 Conflict naming the field.
function conflictFor(error) {
  if (!(error instanceof DuplicateKeyError)) return error;
  return AppError.conflict(
    `${error.field} "${error.value}" is already used by another installation`,
    [{ field: error.field, message: 'is already in use' }],
  );
}

// Creates an installation on a substation. The server sets the id, the
// hierarchy fields (from the substation) and a new device key. The plaintext
// key is returned only here, once; only its SHA-256 hash is stored.
async function createInstallation(user, substationId, fields) {
  const substation = await getSubstation(user, substationId);
  const district = await repositories.districts.findById(substation.district_id);

  // A real random key (the seed's demo keys are deterministic on purpose).
  const deviceKey = `dk_${crypto.randomBytes(32).toString('hex')}`;
  const now = toIsoUtc(clock.now());
  try {
    const installation = await repositories.installations.create({
      substation_id: substation.id,
      district_id: district.id,
      province_id: district.province_id,
      ...fields,
      device_key_hash: crypto.createHash('sha256').update(deviceKey).digest('hex'),
      created_at: now,
      updated_at: now,
    });
    return { installation, deviceKey };
  } catch (error) {
    throw conflictFor(error);
  }
}

// Applies validated changes, for both PUT (all editable fields) and PATCH
// (some). If nothing actually changes, nothing is written and updated_at stays
// the same, so repeating a request gives an identical result (idempotent).
async function updateInstallation(user, installationId, changes) {
  const current = await getInstallation(user, installationId);
  const changed = Object.keys(changes).some((field) => current[field] !== changes[field]);
  if (!changed) return current;

  try {
    return await repositories.installations.update(installationId, {
      ...changes,
      updated_at: toIsoUtc(clock.now()),
    });
  } catch (error) {
    throw conflictFor(error);
  }
}

// Deletes an installation that has never reported. One with readings is
// refused: deleting it would orphan or destroy its history, so the client is
// told to mark it inactive instead.
async function deleteInstallation(user, installationId) {
  await getInstallation(user, installationId);
  const { total } = await repositories.readings.findMany(
    { installation_ids: [installationId] },
    { limit: 1 },
  );
  if (total > 0) {
    throw new AppError(
      409,
      'INSTALLATION_HAS_READINGS',
      `Installation "${installationId}" has ${total} readings and cannot be deleted. ` +
        'Set its status to "inactive" instead, so its history is kept.',
    );
  }
  await repositories.installations.remove(installationId);
}

module.exports = {
  listInstallations,
  listInstallationsOnSubstation,
  getInstallation,
  createInstallation,
  updateInstallation,
  deleteInstallation,
};
