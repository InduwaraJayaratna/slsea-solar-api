const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema(
  {
    // GET /districts/{district_id}, and the jurisdiction checks
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // GET /provinces/{province_id}/districts
    province_id: { type: String, required: true, index: true },
  },
  { id: false },
);

module.exports = mongoose.model('District', districtSchema, 'districts');
