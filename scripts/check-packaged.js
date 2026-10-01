const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Run with the packaged Electron runtime so ASAR paths and native addons are tested
// with the exact runtime shipped to users, without requiring a graphical display.
if (!process.argv.includes('--inside-electron')) {
  const output = path.resolve('release');
  const executable = process.platform === 'win32'
    ? path.join(output, 'win-unpacked', 'portal-console.exe')
    : process.platform === 'darwin'
      ? path.join(output, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'portal-console.app', 'Contents', 'MacOS', 'portal-console')
      : path.join(output, 'linux-unpacked', 'portal-console');
  const resources = process.platform === 'darwin'
    ? path.resolve(path.dirname(executable), '..', 'Resources')
    : path.join(path.dirname(executable), 'resources');
  const result = spawnSync(executable, [__filename, '--inside-electron', resources], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit', timeout: 20000
  });
  if (result.error) console.error(result.error);
  process.exitCode = result.status ?? 1;
} else {
  const resources = process.argv[process.argv.indexOf('--inside-electron') + 1];
  async function check() {
    const sharp = require(path.join(resources, 'app.asar', 'node_modules', 'sharp'));
    await sharp({ create: { width: 1, height: 1, channels: 4, background: '#000' } }).png().toBuffer();
    const pty = require(path.join(resources, 'app.asar', 'node_modules', 'node-pty'));
    await new Promise((resolve, reject) => {
      const marker = 'portal-pty-smoke-ok';
      const child = process.platform === 'win32'
        ? pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', `Write-Output '${marker}'`], { cols: 80, rows: 24 })
        : pty.spawn('/bin/sh', ['-c', `printf '${marker}'`], { cols: 80, rows: 24 });
      let output = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Packaged PTY timed out')); }, 10000);
      child.onData((data) => { output += data; });
      child.onExit(() => {
        clearTimeout(timer);
        if (output.includes(marker)) resolve();
        else reject(new Error('Packaged PTY did not produce expected output'));
      });
    });
    console.log(`Packaged PTY and sharp verified: ${process.platform}-${process.arch}`);
    // Windows ConPTY may leave its worker handles alive after the exit event.
    process.exit(0);
  }
  check().catch((error) => { console.error(error); process.exit(1); });
}
