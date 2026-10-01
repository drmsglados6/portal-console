const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { version, build } = require('../package.json');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-update-'));
function install(script, source, directory, log) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Source', source, '-InstallDir', directory, '-LogDir', log, '-SkipEnvironment'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
}
try {
  const old = path.join(temporary, 'old');
  const target = path.join(temporary, 'installed');
  const payload = path.join(temporary, 'payload');
  const log = path.join(temporary, 'logs');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, 'portal-console.exe'), 'legacy-payload');
  // Optional archived-installer check; CI uses its known on-disk layout.
  const legacy = path.resolve('release-0929/installer/install.ps1');
  if (process.argv.includes('--actual-legacy') && fs.existsSync(legacy)) install(legacy, old, target, log);
  else {
    fs.mkdirSync(target);
    fs.copyFileSync(path.join(old, 'portal-console.exe'), path.join(target, 'portal-console.exe'));
    fs.writeFileSync(path.join(target, 'portal-console.cmd'), '@"%~dp0portal-console.exe" %*');
    fs.copyFileSync('installer/uninstall.ps1', path.join(target, 'uninstall.ps1'));
  }
  fs.mkdirSync(path.join(payload, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(payload, 'portal-console.exe'), 'updated-payload');
  fs.writeFileSync(path.join(payload, 'resources', 'build-info.json'), JSON.stringify({ appId: build.appId, version }));
  const userConfig = path.join(temporary, 'user-config.json');
  fs.writeFileSync(userConfig, '{"preserved":true}');
  install(path.resolve('installer/install.ps1'), payload, target, log);
  const record = JSON.parse(fs.readFileSync(path.join(target, '.portal-console-install.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(record.method, 'windows-simple');
  assert.equal(record.previousMethod, 'windows-simple-legacy');
  assert.equal(record.version, version);
  assert.equal(fs.readFileSync(path.join(target, 'portal-console.exe'), 'utf8'), 'updated-payload');
  assert.equal(fs.readFileSync(userConfig, 'utf8'), '{"preserved":true}');
  install(path.resolve('installer/install.ps1'), payload, target, log);
  const second = JSON.parse(fs.readFileSync(path.join(target, '.portal-console-install.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(second.previousMethod, 'windows-simple');
  assert.equal(second.previousVersion, version);
  fs.writeFileSync(path.join(target, '.portal-console-install.json'), JSON.stringify({ schemaVersion: 1, appId: build.appId, method: 'windows-nsis', version }));
  assert.throws(() => install(path.resolve('installer/install.ps1'), payload, target, log), /windows-nsis/);
  fs.writeFileSync(path.join(target, '.portal-console-install.json'), JSON.stringify(second));
  const removed = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('installer/uninstall.ps1'),
    '-InstallDir', target, '-LogDir', log, '-SkipEnvironment'], { encoding: 'utf8' });
  assert.equal(removed.status, 0, `${removed.stdout}\n${removed.stderr}`);
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(log), true);
  assert.equal(fs.readFileSync(userConfig, 'utf8'), '{"preserved":true}');
  console.log('Legacy release-0929 layout and recorded Windows simple-installer updates verified');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
