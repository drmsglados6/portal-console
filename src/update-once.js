// Bundled into the self-contained Release asset update-once.cjs.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const updater = require('./updater');
const targetVersion = require('../package.json').version;
const supportFiles = {
  helper: require('../installer/install-unix.sh'),
  windowsRunner: require('./update-runner.ps1'),
  unixRunner: require('./update-runner.sh')
};

async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`Portal Console one-time updater to v${targetVersion}. Use update-once.ps1 or update-once.sh. Options: --check, --yes. No system Node.js or GitHub login required.`);
    return;
  }
  if (args.some((arg) => !['--check', '--yes'].includes(arg))) throw new Error('Use --check or --yes only.');
  const resources = process.platform === 'darwin' ? path.resolve(path.dirname(process.execPath), '../Resources') : path.join(path.dirname(process.execPath), 'resources');
  const build = JSON.parse(fs.readFileSync(path.join(resources, 'build-info.json'), 'utf8'));
  if (build.appId !== 'science.aperture.portalconsole') throw new Error('Run this updater with the installed Portal Console runtime.');
  console.log(`Checking v${targetVersion}; installed version: ${build.version}`);
  const result = await updater.checkForUpdate(build.version, { tag: targetVersion });
  if (!result.available) { console.log(`This installation is already at v${targetVersion} or newer.`); return; }
  const context = updater.updateContext({ packaged: true });
  console.log(`Update: ${build.version} -> ${result.version}; method: ${context.method}; target: ${context.target}`);
  if (args.includes('--check')) return;
  if (!args.includes('--yes')) {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!/^y(?:es)?$/i.test((await input.question('Close other Portal Console windows. Install this update? [y/N] ')).trim())) { console.log('Update cancelled.'); return; }
    } finally { input.close(); }
  }
  console.log('Downloading and verifying the installer...');
  const plan = await updater.prepareUpdate(result.release, context, { supportFiles });
  try {
    if (process.platform === 'win32') {
      await updater.launchUpdate(plan);
      console.log(`Installer started. Log: ${plan.logFile}`);
      process.exit(0); // Release the installed .exe before the independent worker replaces it.
    } else process.exitCode = await updater.launchUpdate(plan, { foreground: true });
  } catch (error) { fs.rmSync(plan.work, { recursive: true, force: true }); throw error; }
}

run().catch((error) => { console.error(`Update failed: ${error.message}`); process.exitCode = 1; });
