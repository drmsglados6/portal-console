const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const afterPack = require('../scripts/after-pack');
const { build } = require('../package.json');

test('Mac package contains the native PTY and executable spawn helper', async (t) => {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-mac-pack-'));
  t.after(() => fs.rmSync(appOutDir, { recursive: true, force: true }));
  await afterPack({ electronPlatformName: 'darwin', appOutDir, packager: { appInfo: { productFilename: build.executableName } } });
  for (const arch of ['x64', 'arm64']) {
    const source = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', `darwin-${arch}`);
    const packaged = path.join(appOutDir, `${build.executableName}.app`, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'node-pty', 'prebuilds', `darwin-${arch}`);
    for (const file of ['pty.node', 'spawn-helper']) {
      assert.deepEqual(fs.readFileSync(path.join(packaged, file)), fs.readFileSync(path.join(source, file)));
    }
    if (process.platform !== 'win32') assert.ok(fs.statSync(path.join(packaged, 'spawn-helper')).mode & 0o111);
  }
  assert.equal(fs.existsSync(path.join(appOutDir, `${build.productName}.app`)), false);
});
