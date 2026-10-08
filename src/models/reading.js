const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema(
  {
    // GET /installations/{installation_id}/readings/{reading_id}
    id: { type: String, required: true, unique: true },
    installation_id: { type: String, required: true },
    timestamp: { type: Date, required: true },
    power_kw: Number,
    energy_kwh: Number,
    voltage_v: Number,
  },
  { id: false },
);

// GET /installations/{installation_id}/readings (newest first), last-reading,
// the overview and the generation summary. Unique: one reading per
// installation per moment, so a device's retry is refused (409).
readingSchema.index({ installation_id: 1, timestamp: -1 }, { unique: true });

// GET /readings across the estate, newest first. installation_id is the
// tie-breaker for readings at the same moment, so pages are always in the same
// order; having it in the index lets MongoDB return them in that order without
// a separate sort.
readingSchema.index({ timestamp: -1, installation_id: -1 });

module.exports = mongoose.model('Reading', readingSchema, 'readings');
