const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { recordInstallation, readInstallation, RECORD_FILE, installationRecordPath } = require('../src/installation');

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

test('macOS install metadata is adjacent to the bundle and migrates legacy records', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-mac-record-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const app = path.join(directory, 'portal-console.app');
  fs.mkdirSync(app);
  const legacy = { schemaVersion: 1, appId: 'science.aperture.portalconsole', method: 'mac-dmg', version: '0.1.6' };
  fs.writeFileSync(path.join(app, RECORD_FILE), JSON.stringify(legacy));
  recordInstallation(app, 'mac-zip', '0.1.7');
  assert.equal(installationRecordPath(app), `${app}.portal-console-install.json`);
  assert.equal(readInstallation(app).previousVersion, '0.1.6');
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, RECORD_FILE))).version, '0.1.6');
});
