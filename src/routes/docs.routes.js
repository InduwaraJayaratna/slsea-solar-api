// The API documentation: Swagger UI at /api-docs and the raw OpenAPI spec at
// /api-docs/openapi.json, both built from docs/openapi.yaml, the one source of
// truth for the documentation.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

// Read once at startup.
const spec = yaml.load(
  fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'openapi.yaml'), 'utf8'),
);

const router = express.Router();

router.get('/openapi.json', (req, res) => res.json(spec));

router.use(swaggerUi.serve);
router.get(
  '/',
  swaggerUi.setup(spec, {
    customSiteTitle: 'SLSEA Solar API documentation',
    swaggerOptions: {
      // Keep the token entered under "Authorize" after a page reload.
      persistAuthorization: true,
      // Do not send the spec to swagger.io's online validator.
      validatorUrl: null,
    },
  }),
);

module.exports = router;
