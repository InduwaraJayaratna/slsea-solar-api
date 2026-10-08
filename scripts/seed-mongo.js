// Loads the seed data in data/seed/ into MongoDB, replacing what is there.
//
// Usage: npm run seed:mongo [-- --force]
//
// For each collection: delete every document, then insert the seed file in
// batches. Safe to re-run: the result is always exactly the seed data. Because
// it deletes data, it refuses to run with NODE_ENV=production unless --force
// is given.
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const config = require('../src/config');
const { connect } = require('../src/config/db');
const models = require('../src/models');

const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');
const COLLECTIONS = ['provinces', 'districts', 'substations', 'installations', 'readings', 'users'];
const BATCH_SIZE = 5000;
const DATE_FIELDS = ['timestamp', 'commissioned_at', 'created_at', 'updated_at'];

function toDocument(record) {
  const document = { ...record };
  for (const field of DATE_FIELDS) {
    if (typeof document[field] === 'string') document[field] = new Date(document[field]);
  }
  return document;
}

async function seedCollection(name) {
  const model = models[name];
  const records = JSON.parse(fs.readFileSync(path.join(SEED_DIR, `${name}.json`), 'utf8'));
  await model.deleteMany({});
  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    const batch = records.slice(start, start + BATCH_SIZE).map(toDocument);
    // ordered: false lets the server insert a batch in parallel instead of one
    // by one. lean: true skips building a Mongoose document per record; the
    // seed is already validated by npm run seed:validate.
    await model.insertMany(batch, { ordered: false, lean: true });
    if (records.length > BATCH_SIZE) {
      process.stdout.write(
        `\r  ${name}: ${Math.min(start + BATCH_SIZE, records.length)} / ${records.length}`,
      );
    }
  }
  if (records.length > BATCH_SIZE) process.stdout.write('\n');
  return records;
}

async function main() {
  if (config.env === 'production' && !process.argv.includes('--force')) {
    console.error(
      'Refusing to seed: NODE_ENV=production and this deletes all data. Pass --force to override.',
    );
    process.exit(1);
  }

  await connect();
  // The database name only, never the URI (it contains the password).
  console.log(`Seeding MongoDB database "${config.mongodbDb}"`);

  let installations = [];
  for (const name of COLLECTIONS) {
    const records = await seedCollection(name);
    if (name === 'installations') installations = records;
  }

  // New installations continue from the highest seed number (INST-0201 next).
  const highest = Math.max(...installations.map((i) => Number(i.id.slice('INST-'.length))));
  await models.counters.replaceOne(
    { _id: 'installations' },
    { _id: 'installations', value: highest },
    { upsert: true },
  );

  // Make each collection's indexes match its model exactly: create missing
  // ones, drop any that are no longer defined.
  for (const name of [...COLLECTIONS, 'counters']) await models[name].syncIndexes();

  console.log('Documents per collection:');
  for (const name of COLLECTIONS) {
    console.log(`  ${name.padEnd(14)} ${await models[name].countDocuments()}`);
  }
  console.log(`  counters       installations = ${highest}`);
}

main()
  .catch((error) => {
    console.error(`Seeding failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
