// Loads the seed JSON files from data/seed/ into memory and builds the indexes
// the memory repositories use. Node caches modules, so this runs once per process.
const fs = require('node:fs');
const path = require('node:path');

// Built from __dirname so loading works whatever directory the server starts in.
const SEED_DIR = path.join(__dirname, '..', '..', '..', 'data', 'seed');

const COLLECTIONS = ['provinces', 'districts', 'substations', 'installations', 'readings', 'users'];

function loadCollection(name) {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, `${name}.json`), 'utf8'));
}

const collections = {};
const byId = {};
for (const name of COLLECTIONS) {
  collections[name] = loadCollection(name);
  byId[name] = new Map(collections[name].map((record) => [record.id, record]));
}

// Readings are almost always read per installation in time order, so group them
// once here instead of filtering 130,000 records on every request.
const readingsByInstallation = new Map();
for (const reading of collections.readings) {
  if (!readingsByInstallation.has(reading.installation_id)) {
    readingsByInstallation.set(reading.installation_id, []);
  }
  readingsByInstallation.get(reading.installation_id).push(reading);
}
// ISO 8601 UTC strings of the same format sort correctly as plain text.
for (const readings of readingsByInstallation.values()) {
  readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

module.exports = { collections, byId, readingsByInstallation };
