const fs = require('node:fs');
const path = require('node:path');
const { APP_ID, recordInstallation } = require('./installation');

function run(args) {
  const [directory, method, logFile, previousVersion, previousMethod] = args;
  const build = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'build-info.json'), 'utf8'));
  if (build.appId !== APP_ID) throw new Error('Invalid Portal Console build metadata');
  const record = recordInstallation(directory, method, build.version, logFile, previousVersion, previousMethod);
  process.stdout.write(`Portal Console installed: ${record.method} ${record.version} (previous: ${record.previousMethod || 'unknown/new'} ${record.previousVersion || ''})\n`);
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { run };
