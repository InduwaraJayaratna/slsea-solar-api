// Builds and deploys the API to AWS (Lambda + API Gateway HTTP API) with SAM.
//
// Usage: npm run deploy
//
// The secrets (MONGODB_URI, JWT_SECRET) are read from the local .env and passed
// to `sam deploy` as parameter overrides. They are never printed: sam is run
// without a shell (so nothing is echoed), and the template marks those
// parameters NoEcho, so SAM and CloudFormation show them as ****.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');
const STACK_NAME = 'slsea-solar-api';
const REGION = 'ap-south-1';
const BUILD_DIR = path.join(ROOT, '.aws-sam', 'build', 'ApiFunction');
// Must never end up in the Lambda package (see "files" in package.json).
const EXCLUDED = ['data', 'tests', 'scripts', 'docs/reference', '.env'];

// Runs a command in the project folder, showing its output; stops on failure.
function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) throw new Error(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed`);
}

// Total size in bytes of a folder.
function folderSize(folder) {
  return fs.readdirSync(folder, { withFileTypes: true, recursive: true }).reduce((total, entry) => {
    if (!entry.isFile()) return total;
    return total + fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }, 0);
}

function readEnv() {
  const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
  for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!env[key]) throw new Error(`${key} is not set in .env`);
    // SAM separates parameter overrides at whitespace.
    if (/\s/.test(env[key])) throw new Error(`${key} in .env must not contain spaces`);
  }
  return env;
}

function main() {
  const env = readEnv();

  run('sam', ['build']);

  // Check the package really left out what it should, and report its size.
  const included = EXCLUDED.filter((entry) => fs.existsSync(path.join(BUILD_DIR, entry)));
  if (included.length > 0) throw new Error(`the package includes ${included.join(', ')}`);
  console.log(`\nPackage size: ${(folderSize(BUILD_DIR) / 1024 / 1024).toFixed(1)} MB unzipped\n`);

  run('sam', [
    'deploy',
    '--stack-name',
    STACK_NAME,
    '--region',
    REGION,
    '--resolve-s3',
    '--capabilities',
    'CAPABILITY_IAM',
    '--no-confirm-changeset',
    '--no-fail-on-empty-changeset',
    '--parameter-overrides',
    `MongoDbUri=${env.MONGODB_URI}`,
    `JwtSecret=${env.JWT_SECRET}`,
    `MongoDbName=${env.MONGODB_DB || 'slsea-solar'}`,
  ]);
}

try {
  main();
} catch (error) {
  // Messages here never contain the secret values.
  console.error(`Deploy failed: ${error.message}`);
  process.exitCode = 1;
}
