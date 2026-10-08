const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    // POST /auth/tokens looks users up by username
    username: { type: String, required: true, unique: true },
    full_name: String,
    role: { type: String, enum: ['admin', 'national', 'provincial', 'district'] },
    province_id: { type: String, default: null },
    district_id: { type: String, default: null },
    password_hash: { type: String, required: true },
  },
  { id: false },
);

module.exports = mongoose.model('User', userSchema, 'users');
