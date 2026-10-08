// Entry point: connects to the data source if it needs a connection, then
// starts the HTTP server on the configured port.
const app = require('./app');
const config = require('./config');

async function start() {
  if (config.dataSource === 'mongo') {
    // Connect before accepting requests, so the first request does not fail
    // or wait. The URI is never logged: it contains the database password.
    await require('./config/db').connect();
    console.log(`Connected to MongoDB (database: ${config.mongodbDb})`);
  }

  app.listen(config.port, (error) => {
    if (error) throw error;
    console.log(
      `slsea-solar-api ${config.version} listening on port ${config.port} (data source: ${config.dataSource})`,
    );
  });
}

start().catch((error) => {
  // Only the message: some driver errors include connection details.
  console.error(`Failed to start: ${error.message}`);
  process.exit(1);
});
