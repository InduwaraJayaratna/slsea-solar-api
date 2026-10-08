// The MongoDB connection, opened once per process and shared.
//
// The connection promise is kept at module level: later calls reuse it instead
// of opening a new connection. On AWS Lambda the module stays loaded between
// invocations of a warm container, so one connection serves many requests.
const mongoose = require('mongoose');
const config = require('./index');

let connection = null;

function connect() {
  if (!connection) {
    if (!config.mongodbUri) {
      throw new Error('MONGODB_URI is not set (see .env.example)');
    }
    connection = mongoose
      .connect(config.mongodbUri, {
        dbName: config.mongodbDb,
        // Give up quickly if no server is reachable, instead of hanging.
        serverSelectionTimeoutMS: 5000,
        // Close a socket idle for this long (a stuck query fails, not hangs).
        socketTimeoutMS: 45000,
        // Small pool: one process (or Lambda container) needs few connections.
        maxPoolSize: 10,
        // Indexes are created by `npm run seed:mongo` (syncIndexes), not every
        // time the server starts.
        autoIndex: false,
      })
      .catch((error) => {
        // Forget the failed attempt so the next call can try again.
        connection = null;
        throw error;
      });
  }
  return connection;
}

module.exports = { connect };
