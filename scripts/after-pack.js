const fs = require('node:fs');
const path = require('node:path');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const resources = path.join(context.appOutDir, appName, 'Contents', 'Resources');
  for (const arch of ['x64', 'arm64']) {
    const source = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds', `darwin-${arch}`);
    const destination = path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty', 'prebuilds', `darwin-${arch}`);
    for (const file of ['pty.node', 'spawn-helper']) {
      const target = path.join(destination, file);
      if (!fs.existsSync(target)) {
        fs.mkdirSync(destination, { recursive: true });
        fs.copyFileSync(path.join(source, file), target);
      }
    }
    fs.chmodSync(path.join(destination, 'spawn-helper'), 0o755);
  }
};
