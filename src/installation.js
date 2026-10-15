const fs = require('node:fs');
const path = require('node:path');

const APP_ID = 'science.aperture.portalconsole';
const RECORD_FILE = '.portal-console-install.json';
const METHODS = ['windows-simple', 'windows-nsis', 'linux-deb', 'linux-appimage', 'mac-app', 'mac-dmg', 'mac-zip'];

function installationRecordPath(directory) {
  // A signed macOS bundle must not be modified after packaging.
  return /\.app$/i.test(directory) ? `${directory}.portal-console-install.json` : path.join(directory, RECORD_FILE);
}

function readInstallation(directory) {
  let file = installationRecordPath(directory);
  if (!fs.existsSync(file) && /\.app$/i.test(directory)) file = path.join(directory, RECORD_FILE);
  if (!fs.existsSync(file)) return null;
  const record = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (record.schemaVersion !== 1 || record.appId !== APP_ID || !METHODS.includes(record.method)) throw new Error('Invalid Portal Console installation record');
  return record;
}

function recordInstallation(directory, method, version, logFile, previousVersion = '', previousMethod = '') {
  if (!METHODS.includes(method) || typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw new Error('Invalid installation method or version');
  const previous = readInstallation(directory);
  if (previousMethod && !METHODS.includes(previousMethod)) throw new Error('Invalid previous installation method');
  const record = {
    schemaVersion: 1, appId: APP_ID, method, version, installedAt: new Date().toISOString(),
    previousMethod: previous?.method || previousMethod || (previousVersion ? method : null),
    previousVersion: previous?.version || previousVersion || null
  };
  const file = installationRecordPath(directory);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`);
  }
  return record;
}

module.exports = { APP_ID, RECORD_FILE, METHODS, readInstallation, recordInstallation, installationRecordPath };
