const mongoose = require('mongoose');

const substationSchema = new mongoose.Schema(
  {
    // GET /substations/{substation_id}
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // GET /districts/{district_id}/substations and the generation summary
    district_id: { type: String, required: true, index: true },
    voltage_kv: Number,
    capacity_mva: Number,
    latitude: Number,
    longitude: Number,
  },
  { id: false },
);

module.exports = mongoose.model('Substation', substationSchema, 'substations');
