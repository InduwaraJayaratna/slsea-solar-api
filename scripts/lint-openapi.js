// Validates docs/openapi.yaml against the OpenAPI 3.0 schema, including every
// $ref. Exits with 1 on the first problem.
//
// Usage: npm run docs:lint
const path = require('node:path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const SPEC = path.join(__dirname, '..', 'docs', 'openapi.yaml');

SwaggerParser.validate(SPEC)
  .then((api) => {
    const operations = Object.values(api.paths).reduce(
      (count, item) => count + Object.keys(item).filter((key) => key !== 'parameters').length,
      0,
    );
    console.log(
      `docs/openapi.yaml is valid OpenAPI ${api.openapi}: ${Object.keys(api.paths).length} paths, ${operations} operations`,
    );
  })
  .catch((error) => {
    console.error(`docs/openapi.yaml is invalid: ${error.message}`);
    process.exit(1);
  });
