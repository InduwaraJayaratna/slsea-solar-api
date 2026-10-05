// Entry point: starts the HTTP server on the configured port.
const app = require('./app');
const config = require('./config');

app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(
    `slsea-solar-api ${config.version} listening on port ${config.port} (data source: ${config.dataSource})`,
  );
});
