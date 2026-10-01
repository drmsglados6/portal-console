const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { recordInstallation, readInstallation, RECORD_FILE } = require('../src/installation');

test('installation records retain method/version history including a legacy deb upgrade', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-record-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, 'logs', 'install.log');
  const first = recordInstallation(directory, 'linux-deb', '0.1.3', log, '0.1.0');
  assert.equal(first.previousVersion, '0.1.0');
  assert.equal(first.previousMethod, 'linux-deb');
  recordInstallation(directory, 'linux-deb', '0.1.4', log);
  assert.equal(readInstallation(directory).previousVersion, '0.1.3');
  assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').length, 2);
  fs.writeFileSync(path.join(directory, RECORD_FILE), JSON.stringify({ schemaVersion: 1, appId: 'another-app', method: 'linux-deb' }));
  assert.throws(() => readInstallation(directory), /Invalid/);
});
