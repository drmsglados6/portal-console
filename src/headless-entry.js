// Entry point for the Linux package, run by Electron's bundled Node runtime.
const args = process.argv.slice(2);
if (args.includes('--preset-list')) {
  const { presetNames } = require('./config');
  process.stdout.write(`${presetNames().join('\n')}\n`);
} else {
  require('./headless').run(args).catch((error) => {
    process.stderr.write(`portal-console: ${error.message}\n`);
    process.exitCode = 1;
  });
}
