const mongoose = require('mongoose');

// id: false turns off Mongoose's built-in `id` getter, so our own string `id`
// field (e.g. "WP") is used instead.
const provinceSchema = new mongoose.Schema(
  {
    // GET /provinces/{province_id}, and every lookup by province id
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
  },
  { id: false },
);

module.exports = mongoose.model('Province', provinceSchema, 'provinces');
