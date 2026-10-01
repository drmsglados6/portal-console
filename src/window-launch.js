const { parseArgs } = require('./config');

function newWindowArgs(argv, packaged, projectPath) {
  const cli = parseArgs(argv);
  return [
    ...(packaged ? [] : [projectPath]),
    ...(cli.config ? ['--config', cli.config] : []),
    ...(cli.preset ? ['--preset', cli.preset] : []),
    ...(cli.mode ? ['--mode', cli.mode] : []),
    ...(cli.fullscreen === true ? ['--fullscreen'] : cli.fullscreen === false ? ['--windowed'] : [])
  ];
}

module.exports = { newWindowArgs };
