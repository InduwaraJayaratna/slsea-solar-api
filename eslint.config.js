// ESLint flat config: recommended rules for CommonJS on Node.
// eslint-config-prettier goes last so it switches off formatting rules
// that would clash with Prettier.
const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  prettier,
];
