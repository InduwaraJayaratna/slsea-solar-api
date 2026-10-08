const mongoose = require('mongoose');

const installationSchema = new mongoose.Schema(
  {
    // GET /installations/{installation_id} and everything beneath it
    id: { type: String, required: true, unique: true },
    // GET /substations/{substation_id}/installations, ?substation_id= filters
    substation_id: { type: String, required: true, index: true },
    // ?district_id= filters, district users' narrowing, the generation summary
    district_id: { type: String, required: true, index: true },
    // ?province_id= filters, provincial users' narrowing
    province_id: { type: String, required: true, index: true },
    // POST /substations/{id}/installations and PUT/PATCH: a meter is used once (409)
    meter_id: { type: String, required: true, unique: true },
    // Same: an inverter is used once (409)
    inverter_id: { type: String, required: true, unique: true },
    site_name: String,
    address: String,
    capacity_kw: Number,
    panel_count: Number,
    status: { type: String, enum: ['active', 'inactive', 'maintenance'] },
    commissioned_at: Date,
    latitude: Number,
    longitude: Number,
    // Device authentication (POST /installations/{id}/readings): finding which
    // installation a presented key belongs to, to tell 403 from 401
    device_key_hash: { type: String, required: true, unique: true },
    created_at: Date,
    updated_at: Date,
  },
  { id: false },
);

module.exports = mongoose.model('Installation', installationSchema, 'installations');
