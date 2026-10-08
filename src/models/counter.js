const mongoose = require('mongoose');

// Named counters, e.g. the last installation number used. Incremented
// atomically ($inc), so two requests creating installations at the same time
// still get different ids, and a deleted installation's id is never reused.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // the counter's name, e.g. "installations"
  value: { type: Number, required: true },
});

module.exports = mongoose.model('Counter', counterSchema, 'counters');
