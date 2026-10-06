// Jurisdiction rules: which part of the hierarchy each user may read. Every
// service uses this one module, so the rules live in a single place.
//
//   admin, national  everything
//   provincial       their province and everything in it
//   district         their district and everything in it, plus their parent
//                    province's own record (not its other districts)
//
// A "location" says where something sits: { province_id, district_id }. A
// province's location has no district_id.
const repositories = require('../repositories');
const AppError = require('../utils/app-error');

// The user's jurisdiction as record fields: {} means everything.
function scopeOf(user) {
  if (user.role === 'provincial') return { province_id: user.province_id };
  if (user.role === 'district') {
    return { province_id: user.province_id, district_id: user.district_id };
  }
  return {};
}

function canAccess(user, location) {
  const scope = scopeOf(user);
  if (scope.province_id && location.province_id !== scope.province_id) return false;
  // A location without a district is a province record: a district user may
  // see their own province's record, which the check above already ensures.
  if (scope.district_id && location.district_id && location.district_id !== scope.district_id) {
    return false;
  }
  return true;
}

// 403, not 404: the resource exists, it is just not this user's to see.
function assertAccess(user, location, description) {
  if (!canAccess(user, location)) {
    throw AppError.forbidden(`${description} is outside your jurisdiction`);
  }
}

// Locations of each kind of record. Installations carry denormalised
// province_id and district_id for exactly this check; a substation only knows
// its district, so its province is looked up.
const locationOf = {
  province: (province) => ({ province_id: province.id }),
  district: (district) => ({ province_id: district.province_id, district_id: district.id }),
  installation: (installation) => ({
    province_id: installation.province_id,
    district_id: installation.district_id,
  }),
  async substation(substation) {
    const district = await repositories.districts.findById(substation.district_id);
    return { province_id: district.province_id, district_id: substation.district_id };
  },
};

// Explicit jurisdiction filters on a collection (?province_id=, ?district_id=,
// ?substation_id=, ?installation_id=) must lie within the user's jurisdiction,
// otherwise 403. A well-formed id that does not exist is let through: it
// matches nothing, and the result is narrowed to the jurisdiction anyway.
async function assertFiltersAccessible(user, filters) {
  if (Object.keys(scopeOf(user)).length === 0) return; // sees everything

  if (filters.province_id) {
    assertAccess(user, { province_id: filters.province_id }, `Province "${filters.province_id}"`);
  }
  if (filters.district_id) {
    const district = await repositories.districts.findById(filters.district_id);
    if (district) assertAccess(user, locationOf.district(district), `District "${district.id}"`);
  }
  if (filters.substation_id) {
    const substation = await repositories.substations.findById(filters.substation_id);
    if (substation) {
      assertAccess(user, await locationOf.substation(substation), `Substation "${substation.id}"`);
    }
  }
  if (filters.installation_id) {
    const installation = await repositories.installations.findById(filters.installation_id);
    if (installation) {
      assertAccess(
        user,
        locationOf.installation(installation),
        `Installation "${installation.id}"`,
      );
    }
  }
}

module.exports = { scopeOf, canAccess, assertAccess, locationOf, assertFiltersAccessible };
