#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'src/renderer/index.html'), path.join(output, 'index.html'));

// Extend electron-builder's own hooks so alternatives, sandbox and AppArmor
// setup stay aligned with the installed builder version.
const templates = path.join(root, 'node_modules/app-builder-lib/templates/linux');
const afterInstall = fs.readFileSync(path.join(templates, 'after-install.tpl'), 'utf8');
fs.writeFileSync(path.join(output, 'linux-after-install.sh'), afterInstall + `
ELECTRON_RUN_AS_NODE=1 '/opt/\${sanitizedProductName}/portal-console-bin' '/opt/\${sanitizedProductName}/resources/app.asar/src/install-record-cli.js' '/opt/\${sanitizedProductName}' linux-deb /var/log/portal-console/install.log "$2" || exit 1
`);
const afterRemove = fs.readFileSync(path.join(templates, 'after-remove.tpl'), 'utf8');
fs.writeFileSync(path.join(output, 'linux-after-remove.sh'), afterRemove + `
if [ "$1" = remove ] || [ "$1" = purge ]; then
  rm -f '/opt/\${sanitizedProductName}/.portal-console-install.json'
fi
`);

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/renderer/renderer.js')],
  bundle: true,
  outfile: path.join(output, 'renderer.js'),
  platform: 'browser',
  format: 'iife',
  sourcemap: true
});

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/renderer/styles.css')],
  bundle: true,
  outfile: path.join(output, 'styles.css'),
  minify: true
});
