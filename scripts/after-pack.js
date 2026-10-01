const fs = require('node:fs');
const path = require('node:path');

module.exports = async (context) => {
  if (context.electronPlatformName === 'linux') {
    const executable = path.join(context.appOutDir, 'portal-console');
    fs.renameSync(executable, path.join(context.appOutDir, 'portal-console-bin'));
    fs.copyFileSync(path.join(__dirname, 'linux-launch.sh'), executable);
    fs.chmodSync(executable, 0o755);
    return;
  }
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
