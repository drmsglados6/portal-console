const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { recordInstallation } = require('../src/installation');
const updater = require('../src/updater');

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal updater '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }));
  return root;
}

function release(name = 'portal-console-0.1.9-linux-x86_64.AppImage', bytes = Buffer.from('new app')) {
  return { tag_name: 'v0.1.9', draft: false, prerelease: false, assets: [{ name, size: bytes.length,
    digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
    browser_download_url: `https://github.com/${updater.REPOSITORY}/releases/download/v0.1.9/${name}` }] };
}

test('stable update checks compare numeric versions and never downgrade', async () => {
  assert.equal(updater.newerVersion('v0.1.10', '0.1.9'), true);
  assert.equal(updater.newerVersion('0.2.0', '0.1.99'), true);
  assert.equal(updater.newerVersion('0.1.8', '0.1.8'), false);
  assert.equal(updater.newerVersion('0.1.7', '0.1.8'), false);
  for (const version of ['0.1.9-beta', '../0.1.9', '01.1.9', '99999999999999999.1.9']) assert.throws(() => updater.newerVersion(version, '0.1.8'));
  const fixture = release();
  const result = await updater.checkForUpdate('0.1.8', { open: async (url) => {
    assert.equal(url, 'https://api.github.com/repos/drmsglados6/portal-console/releases/latest');
    return Readable.from([JSON.stringify(fixture)]);
  } });
  assert.equal(result.available, true);
  await assert.rejects(updater.checkForUpdate('0.1.8', { open: async () => Readable.from([JSON.stringify({ ...fixture, prerelease: true })]) }), /stable/);
  await assert.rejects(updater.checkForUpdate('0.1.8', { open: async () => { throw new Error('offline'); } }), /offline/);
});

test('each installation method selects only its matching official asset', () => {
  const cases = [
    ['win32', 'x64', 'windows-nsis', 'portal-console-0.1.9-win-x64-setup.exe'],
    ['win32', 'x64', 'windows-simple', 'portal-console-simple-installer-win-x64.zip'],
    ['win32', 'x64', 'windows-portable', 'portal-console-0.1.9-win-x64-portable.exe'],
    ['linux', 'x64', 'linux-deb', 'portal-console-0.1.9-linux-amd64.deb'],
    ['linux', 'x64', 'linux-appimage', 'portal-console-0.1.9-linux-x86_64.AppImage'],
    ['darwin', 'x64', 'mac-dmg', 'portal-console-0.1.9-mac-x64.dmg'],
    ['darwin', 'arm64', 'mac-zip', 'portal-console-0.1.9-mac-arm64.zip'],
    ['darwin', 'arm64', 'mac-app', 'portal-console-0.1.9-mac-arm64.zip']
  ];
  for (const [platform, arch, method, name] of cases) {
    const context = { platform, arch, method };
    const fixture = release(name);
    assert.equal(updater.releaseAsset(fixture, context).name, name);
    assert.throws(() => updater.releaseAsset({ ...fixture, assets: [] }, context), /matching installer/);
    assert.throws(() => updater.releaseAsset({ ...fixture, assets: [{ ...fixture.assets[0], browser_download_url: 'https://other.example/app' }] }, context), /Invalid package/);
    assert.throws(() => updater.releaseAsset({ ...fixture, assets: [{ ...fixture.assets[0], digest: null }] }, context), /SHA-256/);
  }
  assert.throws(() => updater.releaseAsset(release(), { platform: 'linux', arch: 'arm64', method: 'linux-appimage' }), /No update package/);
});

test('download verifies digest and size, cleans failures and never overwrites an existing file', async (t) => {
  const root = temporary(t), bytes = Buffer.from('verified package');
  const asset = release(undefined, bytes).assets[0], file = path.join(root, 'download');
  const open = async () => Readable.from([bytes]);
  await updater.downloadAsset(asset, file, { open });
  assert.deepEqual(fs.readFileSync(file), bytes);
  await assert.rejects(updater.downloadAsset(asset, file, { open }), /EEXIST/);
  assert.deepEqual(fs.readFileSync(file), bytes);
  fs.unlinkSync(file);
  await assert.rejects(updater.downloadAsset({ ...asset, digest: `sha256:${'0'.repeat(64)}` }, file, { open }), /verification/);
  assert.equal(fs.existsSync(file), false);
  await assert.rejects(updater.downloadAsset({ ...asset, size: 1 }, file, { open }), /expected size/);
  assert.equal(fs.existsSync(file), false);
  await assert.rejects(updater.downloadAsset(asset, file, { open: async () => { throw new Error('offline'); } }), /offline/);
  assert.equal(fs.existsSync(file), false);
});

test('update context preserves recorded methods and rejects source/unknown installations', (t) => {
  const root = temporary(t);
  assert.throws(() => updater.updateContext({ packaged: false }), /git pull/);
  const directory = process.platform === 'darwin' ? path.join(root, 'portal-console.app') : path.join(root, 'app');
  fs.mkdirSync(directory);
  const executable = process.platform === 'darwin' ? path.join(directory, 'Contents', 'MacOS', 'portal-console') : path.join(directory, 'portal-console.exe');
  const options = { executable, packaged: true, env: {} };
  if (process.platform !== 'darwin') assert.throws(() => updater.updateContext(options), /unknown/);
  const method = process.platform === 'win32' ? 'windows-nsis' : process.platform === 'darwin' ? 'mac-dmg' : 'linux-deb';
  recordInstallation(directory, method, '0.1.8');
  const context = updater.updateContext(options);
  assert.equal(context.method, method);
  assert.equal(context.target, directory);
});

test('staging validates the complete package and creates independent worker files', async (t) => {
  const root = temporary(t), bytes = Buffer.from('new app');
  const context = { platform: 'win32', arch: 'x64', method: 'windows-nsis', target: path.join(root, 'installed app') };
  const fixture = release('portal-console-0.1.9-win-x64-setup.exe', bytes);
  const plan = await updater.prepareUpdate(fixture, context, { temporaryRoot: root, open: async () => Readable.from([bytes]) });
  assert.deepEqual(fs.readFileSync(plan.file), bytes);
  assert.match(fs.readFileSync(plan.script, 'utf8'), /WaitForExit/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(plan.work, 'plan.json'))).target, context.target);
  assert.equal(updater.workerCommand(plan).args.at(-1), path.join(plan.work, 'plan.json'));
  const before = fs.readdirSync(root);
  await assert.rejects(updater.prepareUpdate(fixture, context, { temporaryRoot: root, open: async () => Readable.from([Buffer.from('bad')]) }), /verification/);
  assert.deepEqual(fs.readdirSync(root), before);
});

test('background handoff waits for worker readiness and fails before closing the app', async (t) => {
  const root = temporary(t);
  const plan = { platform: 'win32', script: path.join(root, 'runner.ps1'), work: root, logFile: path.join(root, 'log') };
  const spawnProcess = (_file, _args, options) => {
    assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
    const child = new EventEmitter(); child.unref = () => {};
    setImmediate(() => { fs.writeFileSync(path.join(root, 'started'), 'ready'); child.emit('spawn'); });
    return child;
  };
  assert.equal(await updater.launchUpdate(plan, { spawnProcess }), 0);
  fs.unlinkSync(path.join(root, 'started'));
  assert.equal(await updater.launchUpdate(plan, { spawnProcess: () => {
    const child = new EventEmitter(); child.unref = () => {};
    setImmediate(() => { child.emit('spawn'); setImmediate(() => {
      child.emit('exit', 0); setTimeout(() => fs.writeFileSync(path.join(root, 'started'), 'ready'), 20);
    }); });
    return child;
  } }), 0);
  fs.unlinkSync(path.join(root, 'started'));
  await assert.rejects(updater.launchUpdate(plan, { spawnProcess: () => {
    const child = new EventEmitter();
    setImmediate(() => { child.emit('spawn'); setImmediate(() => child.emit('exit', 1)); }); return child;
  } }), /did not start/);
});

test('Unix worker performs a verified atomic AppImage replacement and preserves the old file on tampering', { skip: process.platform === 'win32' }, async (t) => {
  const root = temporary(t), target = path.join(root, 'my image.AppImage'), bytes = Buffer.from('new app');
  const context = { platform: 'linux', arch: 'x64', method: 'linux-appimage-portable', target };
  const fixture = release(undefined, bytes);
  fs.writeFileSync(target, 'old app');
  const plan = await updater.prepareUpdate(fixture, context, { temporaryRoot: root, open: async () => Readable.from([bytes]), logFile: path.join(root, 'update.log') });
  assert.equal(await updater.launchUpdate(plan, { foreground: true }), 0);
  assert.deepEqual(fs.readFileSync(target), bytes);
  assert.ok(fs.statSync(target).mode & 0o100);
  assert.equal(fs.existsSync(plan.work), false);
  const bad = await updater.prepareUpdate(fixture, context, { temporaryRoot: root, open: async () => Readable.from([bytes]), logFile: path.join(root, 'bad.log') });
  fs.writeFileSync(bad.file, 'tampered');
  assert.notEqual(await updater.launchUpdate(bad, { foreground: true }), 0);
  assert.deepEqual(fs.readFileSync(target), bytes);
});

test('Windows worker rejects a tampered installer before changing the installation', { skip: process.platform !== 'win32' }, async (t) => {
  const root = temporary(t), target = path.join(root, 'installed'), bytes = Buffer.from('download');
  const context = { platform: 'win32', arch: 'x64', method: 'windows-simple', target };
  fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'preserved'), 'old app');
  const plan = await updater.prepareUpdate(release('portal-console-simple-installer-win-x64.zip', bytes), context, {
    temporaryRoot: root, parentPid: 0, logFile: path.join(root, 'update.log'), open: async () => Readable.from([bytes])
  });
  fs.writeFileSync(plan.file, 'tampered');
  const worker = updater.workerCommand(plan);
  const result = spawnSync(worker.command, [...worker.args, '-NonInteractive'], {
    env: { ...process.env, PSModulePath: path.join(root, 'nonexistent-modules') }, encoding: 'utf8', timeout: 20000
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(fs.readFileSync(plan.logFile, 'utf8'), /SHA-256/);
  assert.equal(fs.readFileSync(path.join(target, 'preserved'), 'utf8'), 'old app');
});
