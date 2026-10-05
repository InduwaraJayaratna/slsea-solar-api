// Reports whether the API is up and what data it is serving.
const config = require('../config');
const repositories = require('../repositories');

async function getHealth() {
  // One repository per collection. Asking each for its count also proves the
  // data source answers.
  const names = Object.keys(repositories);
  const counts = await Promise.all(names.map((name) => repositories[name].count()));

  return {
    status: 'ok',
    version: config.version,
    data_source: config.dataSource,
    record_counts: Object.fromEntries(names.map((name, i) => [name, counts[i]])),
  };
}

module.exports = { getHealth };
