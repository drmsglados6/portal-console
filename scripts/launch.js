#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (args.includes('--preset-list')) {
  const { presetNames } = require('../src/config');
  process.stdout.write(`${presetNames().join('\n')}\n`);
  process.exit(0);
}
const forcedHeadless = args.includes('--headless');
const noDesktop = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

if (forcedHeadless || noDesktop) {
  require('../src/headless').run(args).catch((error) => {
    process.stderr.write(`portal-console: ${error.message}\n`);
    process.exitCode = 1;
  });
} else {
  const electron = require('electron');
  const result = spawnSync(electron, [path.resolve(__dirname, '..'), ...args], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
