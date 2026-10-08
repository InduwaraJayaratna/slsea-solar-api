// MongoDB repositories: the same interface as the memory repositories (see
// ../memory/index.js), backed by real database queries. Services cannot tell
// which one they are using.
//
// Records go in and out in the API's own shape: string ids, ISO 8601 UTC
// timestamp strings, and no MongoDB-only fields (_id, __v).
const models = require('../../models');
const { DuplicateKeyError } = require('../errors');
const { toIsoUtc } = require('../../utils/iso-8601');

// Fields stored as BSON Dates (so they sort and compare as times).
const DATE_FIELDS = ['timestamp', 'commissioned_at', 'created_at', 'updated_at'];

// A document from MongoDB (lean, so a plain object) to an API-shaped record.
function toRecord(document) {
  if (!document) return null;
  const record = { ...document };
  delete record._id;
  delete record.__v;
  for (const field of DATE_FIELDS) {
    if (record[field] instanceof Date) record[field] = toIsoUtc(record[field].getTime());
  }
  return record;
}

// An API-shaped record (or set of changes) to what is stored: ISO strings to Dates.
function toDocument(record) {
  const document = { ...record };
  for (const field of DATE_FIELDS) {
    if (typeof document[field] === 'string') document[field] = new Date(document[field]);
  }
  return document;
}

// MongoDB reports a unique index violation as error code 11000. It becomes our
// DuplicateKeyError, which services turn into 409 Conflict.
function translateError(error) {
  if (error.code !== 11000) return error;
  const [field = 'id'] = Object.keys(error.keyPattern ?? {});
  return new DuplicateKeyError(field, error.keyValue?.[field]);
}

function createRepository(model) {
  return {
    // Equality filter on any fields, sorted by id (as in memory).
    async findAll(filter = {}) {
      const documents = await model.find(filter).sort({ id: 1 }).lean();
      return documents.map(toRecord);
    },

    async findById(id) {
      return toRecord(await model.findOne({ id }).lean());
    },

    // A live count of the documents in the collection (used by /health).
    async count() {
      return model.countDocuments();
    },
  };
}

module.exports = {
  provinces: createRepository(models.provinces),
  districts: createRepository(models.districts),
  substations: createRepository(models.substations),

  installations: {
    ...createRepository(models.installations),

    async create(fields) {
      // $inc is atomic, so concurrent creates get different numbers, and the
      // counter only goes up: a deleted installation's id is never reused.
      const counter = await models.counters
        .findOneAndUpdate(
          { _id: 'installations' },
          { $inc: { value: 1 } },
          { upsert: true, returnDocument: 'after' },
        )
        .lean();
      const id = `INST-${String(counter.value).padStart(4, '0')}`;
      try {
        const created = await models.installations.create(toDocument({ id, ...fields }));
        return toRecord(created.toObject());
      } catch (error) {
        throw translateError(error);
      }
    },

    async update(id, changes) {
      try {
        const updated = await models.installations
          .findOneAndUpdate({ id }, { $set: toDocument(changes) }, { returnDocument: 'after' })
          .lean();
        return toRecord(updated);
      } catch (error) {
        throw translateError(error);
      }
    },

    async remove(id) {
      const { deletedCount } = await models.installations.deleteOne({ id });
      return deletedCount === 1;
    },
  },

  readings: {
    ...createRepository(models.readings),

    async appendReading(reading) {
      try {
        const created = await models.readings.create(toDocument(reading));
        return toRecord(created.toObject());
      } catch (error) {
        // Either unique index (id, or installation_id + timestamp) means the
        // reading already exists.
        if (error.code === 11000) throw new DuplicateKeyError('id', reading.id);
        throw error;
      }
    },

    // find(filter).sort().skip().limit() for the page, and countDocuments(filter)
    // for the total, run at the same time.
    async findMany(filter = {}, { sort = '-timestamp', skip = 0, limit = 50 } = {}) {
      const query = {};
      if (filter.installation_ids) query.installation_id = { $in: filter.installation_ids };
      if (filter.from || filter.to) {
        query.timestamp = {};
        if (filter.from) query.timestamp.$gte = new Date(filter.from);
        if (filter.to) query.timestamp.$lt = new Date(filter.to);
      }
      // installation_id breaks ties between readings at the same moment, giving
      // the same order as the memory repository (and the readings index).
      const direction = sort === 'timestamp' ? 1 : -1;

      const [documents, total] = await Promise.all([
        models.readings
          .find(query)
          .sort({ timestamp: direction, installation_id: direction })
          .skip(skip)
          .limit(limit)
          .lean(),
        models.readings.countDocuments(query),
      ]);
      return { items: documents.map(toRecord), total };
    },

    // One aggregation pipeline: $match the installations' readings, then
    // $facet into four branches computed from the same documents.
    async summariseByInstallations(installationIds, dayStart, dayEnd) {
      const start = new Date(dayStart);
      const end = new Date(dayEnd);
      const inDay = { $match: { timestamp: { $gte: start, $lt: end } } };
      // Per installation, the newest reading among those passed in.
      const newestPerInstallation = [
        { $sort: { installation_id: 1, timestamp: -1 } },
        { $group: { _id: '$installation_id', reading: { $first: '$$ROOT' } } },
      ];

      const [facets] = await models.readings.aggregate([
        { $match: { installation_id: { $in: installationIds } } },
        {
          $facet: {
            latest: newestPerInstallation,
            lastBeforeDay: [{ $match: { timestamp: { $lt: start } } }, ...newestPerInstallation],
            day: [
              inDay,
              { $sort: { installation_id: 1, timestamp: 1 } },
              {
                $group: {
                  _id: '$installation_id',
                  first: { $first: '$$ROOT' },
                  last: { $last: '$$ROOT' },
                },
              },
            ],
            // District power at each moment of the day, highest first (earliest on a tie).
            peak: [
              inDay,
              { $group: { _id: '$timestamp', power_kw: { $sum: '$power_kw' } } },
              { $sort: { power_kw: -1, _id: 1 } },
              { $limit: 1 },
            ],
          },
        },
      ]);

      const byInstallation = (branch, pick) =>
        new Map(facets[branch].map((group) => [group._id, pick(group)]));
      const latest = byInstallation('latest', (group) => group.reading);
      const lastBeforeDay = byInstallation('lastBeforeDay', (group) => group.reading);
      const day = byInstallation('day', (group) => group);

      const installations = installationIds.map((installationId) => ({
        installation_id: installationId,
        latest: toRecord(latest.get(installationId)),
        last_before_day: toRecord(lastBeforeDay.get(installationId)),
        first_in_day: toRecord(day.get(installationId)?.first),
        last_in_day: toRecord(day.get(installationId)?.last),
      }));
      const [peak] = facets.peak;
      return {
        installations,
        peak: peak ? { timestamp: toIsoUtc(peak._id.getTime()), power_kw: peak.power_kw } : null,
      };
    },
  },

  users: createRepository(models.users),
};
