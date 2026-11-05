const path = require('node:path');
const os = require('node:os');
const { registerAlias, removeAlias, windowsPath } = require('./cli-alias');

const [target, requestedDirectory, ...flags] = process.argv.slice(2);
if (!target) throw new Error('Expected the installed executable and optional command directory.');
const directory = requestedDirectory || (process.platform === 'win32' ? path.dirname(target) : path.join(os.homedir(), '.local', 'bin'));
if (flags.includes('--remove')) {
  removeAlias(target, directory);
  if (process.platform === 'win32' && !flags.includes('--skip-environment')) windowsPath(directory, true);
} else {
  const result = registerAlias(target, directory);
  if (result.installed) {
    if (process.platform === 'win32' && !flags.includes('--skip-environment')) windowsPath(directory);
    console.log(`pconsole launcher: ${result.file}`);
    if (process.platform !== 'win32' && !(process.env.PATH || '').split(':').includes(directory)) console.log(`Add ${directory} to PATH to run pconsole from a new terminal.`);
  } else console.log(`pconsole launcher skipped: existing command at ${result.conflict}`);
}
