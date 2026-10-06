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
const { DuplicateKeyError } = require('../errors');

// Writes change only this in-memory copy of the seed data: they are lost when
// the server restarts. The seed files on disk are never modified.

// Records are flat, so a shallow copy is a full copy. Returning copies stops a
// caller from changing the stored data by accident.
const copy = (record) => ({ ...record });

// Inserts `reading` into a list kept in compareReadings order, so the time
// indexes stay sorted without re-sorting everything.
function insertSorted(list, reading) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (compareReadings(list[mid], reading) < 0) low = mid + 1;
    else high = mid;
  }
  list.splice(low, 0, reading);
}

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

// The highest installation number in use, e.g. 200 for INST-0200.
let lastInstallationNumber = Math.max(
  0,
  ...collections.installations.map((record) => Number(record.id.slice('INST-'.length))),
);

const UNIQUE_INSTALLATION_FIELDS = ['meter_id', 'inverter_id', 'device_key_hash'];

// Throws DuplicateKeyError if another installation (not `ownId`) already has
// one of the unique values in `fields`.
function assertUniqueInstallation(fields, ownId) {
  for (const field of UNIQUE_INSTALLATION_FIELDS) {
    if (fields[field] === undefined) continue;
    const taken = collections.installations.some(
      (record) => record.id !== ownId && record[field] === fields[field],
    );
    if (taken) throw new DuplicateKeyError(field, fields[field]);
  }
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
  installations: {
    ...createRepository('installations'),

    // Stores a new installation and returns it with its new id. Like unique
    // indexes in a database, a meter_id, inverter_id or device key already in
    // use is refused with DuplicateKeyError.
    async create(fields) {
      assertUniqueInstallation(fields);
      // Ids come from a counter, never reused, so a deleted installation's URL
      // can never point at a different installation later.
      lastInstallationNumber += 1;
      const record = { id: `INST-${String(lastInstallationNumber).padStart(4, '0')}`, ...fields };
      collections.installations.push(record);
      byId.installations.set(record.id, record);
      return copy(record);
    },

    // Applies `changes` to an installation; returns it, or null if it does not exist.
    async update(id, changes) {
      const record = byId.installations.get(id);
      if (!record) return null;
      assertUniqueInstallation(changes, id);
      Object.assign(record, changes);
      return copy(record);
    },

    // Deletes an installation; true if it existed.
    async remove(id) {
      if (!byId.installations.delete(id)) return false;
      const index = collections.installations.findIndex((record) => record.id === id);
      collections.installations.splice(index, 1);
      return true;
    },
  },
  readings: {
    ...createRepository('readings'),

    // Adds a reading. Readings are append-only, so there is no update or
    // remove. The id is unique, as a database's primary key would be.
    async appendReading(reading) {
      if (byId.readings.has(reading.id)) throw new DuplicateKeyError('id', reading.id);
      const record = { ...reading };
      collections.readings.push(record);
      byId.readings.set(record.id, record);
      if (!readingsByInstallation.has(record.installation_id)) {
        readingsByInstallation.set(record.installation_id, []);
      }
      insertSorted(readingsByInstallation.get(record.installation_id), record);
      insertSorted(readingsByTime, record);
      return copy(record);
    },

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
