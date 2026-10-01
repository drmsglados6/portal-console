#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'src/renderer/index.html'), path.join(output, 'index.html'));

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
