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
  // A real bundled runtime is needed to exercise CLI registration. A directory
  // named app.asar stands in for the archive for this installer-only fixture.
  fs.copyFileSync(process.execPath, path.join(payload, 'portal-console.exe'));
  const sources = path.join(payload, 'resources', 'app.asar', 'src');
  fs.mkdirSync(sources, { recursive: true });
  for (const name of ['register-cli.js', 'cli-alias.js']) fs.copyFileSync(path.join('src', name), path.join(sources, name));
  fs.writeFileSync(path.join(payload, 'resources', 'build-info.json'), JSON.stringify({ appId: build.appId, version }));
  const userConfig = path.join(temporary, 'user-config.json');
  fs.writeFileSync(userConfig, '{"preserved":true}');
  install(path.resolve('installer/install.ps1'), payload, target, log);
  const record = JSON.parse(fs.readFileSync(path.join(target, '.portal-console-install.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(record.method, 'windows-simple');
  assert.equal(record.previousMethod, 'windows-simple-legacy');
  assert.equal(record.version, version);
  assert.deepEqual(fs.readFileSync(path.join(target, 'portal-console.exe')), fs.readFileSync(process.execPath));
  assert.ok(fs.readFileSync(path.join(target, 'pconsole.cmd'), 'utf8').includes(`@"${path.join(target, 'portal-console.exe')}" %*`));
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
  if (process.argv.includes('--packaged')) {
    const packagedTarget = path.join(temporary, 'packaged app');
    install(path.resolve('installer/install.ps1'), path.resolve('release/win-unpacked'), packagedTarget, log);
    assert.ok(fs.existsSync(path.join(packagedTarget, 'pconsole.cmd')));
    const work = path.join(temporary, 'worker'); fs.mkdirSync(work);
    const archive = path.resolve('release/portal-console-simple-installer-win-x64.zip');
    const digest = require('node:crypto').createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const planFile = path.join(work, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify({ method: 'windows-simple', parentPid: 0, file: archive, digest,
      target: packagedTarget, work, logFile: path.join(log, 'update.log'), version }));
    const updated = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('src/update-runner.ps1'), '-PlanFile', planFile, '-NoRestart', '-NonInteractive', '-SkipEnvironment'], { encoding: 'utf8', timeout: 120000 });
    assert.equal(updated.status, 0, `${updated.stdout}\n${updated.stderr}\n${fs.existsSync(path.join(log, 'update.log')) ? fs.readFileSync(path.join(log, 'update.log'), 'utf8') : ''}`);
    const upgraded = JSON.parse(fs.readFileSync(path.join(packagedTarget, '.portal-console-install.json'), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(upgraded.method, 'windows-simple'); assert.equal(upgraded.previousVersion, version);
    const uninstalled = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('installer/uninstall.ps1'), '-InstallDir', packagedTarget, '-LogDir', log, '-SkipEnvironment'], { encoding: 'utf8' });
    assert.equal(uninstalled.status, 0, uninstalled.stderr);
    console.log('Real packaged Electron runtime and simple-ZIP update worker verified without changing user PATH');
  }
  console.log('Legacy release-0929 layout and recorded Windows simple-installer updates verified');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
