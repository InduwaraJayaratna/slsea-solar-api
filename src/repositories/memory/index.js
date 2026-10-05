// Memory repositories: one per entity, reading from the in-memory data store.
//
// Every method is async (returns a Promise) although the data is already in
// memory. A database-backed implementation must be async, and keeping the same
// interface means services work unchanged when the data source is swapped.
const { collections, byId, readingsByInstallation } = require('./data-store');

// Records are flat, so a shallow copy is a full copy. Returning copies stops a
// caller from changing the stored data by accident.
const copy = (record) => ({ ...record });

function createRepository(name) {
  return {
    async findById(id) {
      const record = byId[name].get(id);
      return record ? copy(record) : null;
    },

    async count() {
      return collections[name].length;
    },
  };
}

module.exports = {
  provinces: createRepository('provinces'),
  districts: createRepository('districts'),
  substations: createRepository('substations'),
  installations: createRepository('installations'),
  readings: {
    ...createRepository('readings'),

    // An installation's readings, oldest first ([] if it has none).
    async findByInstallationId(installationId) {
      return (readingsByInstallation.get(installationId) ?? []).map(copy);
    },
  },
  users: createRepository('users'),
};
