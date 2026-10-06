// Memory repositories: one per entity, reading from the in-memory data store.
//
// Every method is async (returns a Promise) although the data is already in
// memory. A database-backed implementation must be async, and keeping the same
// interface means services work unchanged when the data source is swapped.
const {
  collections,
  byId,
  readingsByInstallation,
  readingsByTime,
  compareReadings,
} = require('./data-store');

// Records are flat, so a shallow copy is a full copy. Returning copies stops a
// caller from changing the stored data by accident.
const copy = (record) => ({ ...record });

// First index in `readings` (sorted by time) whose timestamp is at or after
// `ms`. Binary search, so a time window is found without scanning every reading.
function firstIndexAtOrAfter(readings, ms) {
  let low = 0;
  let high = readings.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (Date.parse(readings[mid].timestamp) < ms) low = mid + 1;
    else high = mid;
  }
  return low;
}

// The part of a time-sorted list inside [from, to). from/to are optional ISO strings.
function inWindow(readings, { from, to }) {
  const start = from ? firstIndexAtOrAfter(readings, Date.parse(from)) : 0;
  const end = to ? firstIndexAtOrAfter(readings, Date.parse(to)) : readings.length;
  return readings.slice(start, Math.max(start, end));
}

function createRepository(name) {
  return {
    // Records whose fields equal every value in `filter` (all records for {}),
    // sorted by id so results and pages come back in a stable order.
    async findAll(filter = {}) {
      const conditions = Object.entries(filter);
      return collections[name]
        .filter((record) => conditions.every(([field, value]) => record[field] === value))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(copy);
    },

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

    // One page of readings, plus how many match in total.
    //   filter.installation_ids  only these installations (omit for all)
    //   filter.from / filter.to  ISO timestamps; from inclusive, to exclusive
    //   sort                     'timestamp' (oldest first) or '-timestamp' (newest first)
    //   skip / limit             the page
    // This is the shape of a MongoDB query (find(filter).sort().skip().limit()
    // plus countDocuments(filter)), so a database implementation can keep it.
    async findMany(filter = {}, { sort = '-timestamp', skip = 0, limit = 50 } = {}) {
      let matches;
      if (filter.installation_ids) {
        // Each installation's list is already in time order; merge the windows.
        matches = filter.installation_ids.flatMap((id) =>
          inWindow(readingsByInstallation.get(id) ?? [], filter),
        );
        if (filter.installation_ids.length > 1) matches.sort(compareReadings);
      } else {
        matches = inWindow(readingsByTime, filter);
      }

      if (sort === '-timestamp') matches.reverse();
      return { items: matches.slice(skip, skip + limit).map(copy), total: matches.length };
    },
  },
  users: createRepository('users'),
};
