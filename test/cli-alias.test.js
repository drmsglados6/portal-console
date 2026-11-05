const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerAlias, removeAlias, windowsPath } = require('../src/cli-alias');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'bin with spaces');
  const target = path.join(root, 'Portal Console.exe');
  fs.writeFileSync(target, 'application');
  return { root, target, directory };
}

test('Windows launcher quotes its executable, forwards arguments and supports repeat installation', (t) => {
  const { target, directory } = fixture(t);
  const options = { platform: 'win32', searchPath: '' };
  const result = registerAlias(target, directory, options);
  assert.equal(result.installed, true);
  assert.match(fs.readFileSync(result.file, 'utf8'), new RegExp(' %\\*\\r\\n$'));
  assert.ok(fs.readFileSync(result.file, 'utf8').includes(`@"${target}"`));
  assert.deepEqual(registerAlias(target, directory, options), result);
  removeAlias(target, directory, 'win32');
  assert.equal(fs.existsSync(result.file), false);
});

test('registration preserves another command in the destination or PATH', (t) => {
  const { root, target, directory } = fixture(t);
  const foreign = path.join(root, 'other');
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign, 'pconsole.exe'), 'another app');
  assert.deepEqual(registerAlias(target, directory, { platform: 'win32', searchPath: foreign }), {
    installed: false, conflict: path.join(foreign, 'pconsole.exe')
  });
  assert.equal(fs.existsSync(directory), false);
  fs.mkdirSync(directory);
  const file = path.join(directory, 'pconsole.cmd');
  fs.writeFileSync(file, 'user launcher');
  assert.equal(registerAlias(target, directory, { platform: 'win32', searchPath: '' }).installed, false);
  removeAlias(target, directory, 'win32');
  assert.equal(fs.readFileSync(file, 'utf8'), 'user launcher');
});

test('uninstall cleans a PATH record without modifying a pre-existing PATH entry', (t) => {
  const { root } = fixture(t);
  const record = path.join(root, '.pconsole-path.json');
  fs.writeFileSync(record, JSON.stringify({ added: false }));
  windowsPath(root, true);
  assert.equal(fs.existsSync(record), false);
});

test('Unix alias retains its exact target and cleanup preserves replacements', { skip: process.platform === 'win32' }, (t) => {
  const { target, directory } = fixture(t);
  const options = { platform: 'linux', searchPath: '' };
  const result = registerAlias(target, directory, options);
  assert.equal(fs.readlinkSync(result.file), target);
  assert.deepEqual(registerAlias(target, directory, options), result);
  fs.unlinkSync(result.file);
  fs.symlinkSync('/another/application', result.file);
  removeAlias(target, directory, 'linux');
  assert.equal(fs.readlinkSync(result.file), '/another/application');
});
