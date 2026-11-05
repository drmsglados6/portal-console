const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
const { readInstallation } = require('./installation');

const REPOSITORY = 'drmsglados6/portal-console';
const API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;

function stableVersion(value) {
  // A numeric -N is this project's distribution revision, newer than the
  // unsuffixed base. It is deliberately not SemVer prerelease ordering.
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([1-9]\d*))?$/.exec(value);
  const parts = match && [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0)];
  if (!parts || parts.some((part) => !Number.isSafeInteger(part))) throw new Error(`Invalid stable version: ${value}`);
  return parts;
}

function newerVersion(candidate, current) {
  const a = stableVersion(candidate), b = stableVersion(current);
  for (let index = 0; index < 4; index += 1) if (a[index] !== b[index]) return a[index] > b[index];
  return false;
}

function request(url, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['github.com', 'api.github.com'].includes(parsed.hostname) && !parsed.hostname.endsWith('.githubusercontent.com')) {
    return Promise.reject(new Error('Unexpected update download host.'));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(parsed, { headers: { 'User-Agent': 'Portal-Console-Updater', Accept: 'application/vnd.github+json' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location || redirects >= 5) { reject(new Error('Too many update redirects.')); return; }
        request(new URL(response.headers.location, parsed).href, redirects + 1).then(resolve, reject);
      } else if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`GitHub update request failed (HTTP ${response.statusCode}). Check your connection or try again later if rate-limited.`));
      } else resolve(response);
    });
    req.setTimeout(30000, () => req.destroy(new Error('GitHub update request timed out.')));
    req.on('error', reject);
  });
}

async function checkForUpdate(currentVersion, { open = request, tag } = {}) {
  stableVersion(currentVersion);
  if (tag) stableVersion(tag);
  const response = await open(tag ? `https://api.github.com/repos/${REPOSITORY}/releases/tags/v${tag.replace(/^v/, '')}` : API);
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length; chunks.push(Buffer.from(chunk));
    if (size > 4 * 1024 * 1024) throw new Error('Release metadata is too large.');
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const supported = (release) => {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return false;
    try { stableVersion(release.tag_name); return true; } catch { return false; }
  };
  if (!tag && !Array.isArray(data)) throw new Error('Invalid GitHub releases response.');
  const candidates = (tag ? [data] : data).filter(supported);
  const release = candidates.reduce((latest, entry) => !latest || newerVersion(entry.tag_name, latest.tag_name) ? entry : latest, null);
  if (!release || tag && release.tag_name.replace(/^v/, '') !== tag.replace(/^v/, '')) throw new Error('No matching stable release found.');
  const version = release.tag_name?.replace(/^v/, '');
  return { available: newerVersion(version, currentVersion), version, release };
}

function updateContext({ platform = process.platform, arch = process.arch, executable = process.execPath, env = process.env, packaged = __dirname.includes('app.asar') } = {}) {
  if (!packaged) throw new Error('Source/development installs are updated with git pull; install a packaged release to use pupdate.');
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32' && env.PORTABLE_EXECUTABLE_FILE) {
    return { platform, arch, method: 'windows-portable', target: env.PORTABLE_EXECUTABLE_FILE };
  }
  const image = platform === 'linux' && env.APPIMAGE;
  const directory = image ? paths.dirname(image) : platform === 'darwin' ? paths.resolve(paths.dirname(executable), '../..') : paths.dirname(executable);
  if (platform === 'darwin' && paths.basename(directory) !== 'portal-console.app') throw new Error('Restore the app name to portal-console.app before updating.');
  const record = readInstallation(directory);
  let method = record?.method;
  if (image && record && record.method !== 'linux-appimage') throw new Error('AppImage installation metadata has another installation method.');
  if (image && !record) method = 'linux-appimage-portable';
  if (platform === 'darwin' && !record && directory.endsWith('.app')) method = 'mac-app';
  if (!method) throw new Error('Installation method is unknown. Update with the original installer first.');
  if (platform === 'win32' && !['windows-nsis', 'windows-simple'].includes(method)
    || platform === 'linux' && !['linux-deb', 'linux-appimage', 'linux-appimage-portable'].includes(method)
    || platform === 'darwin' && !['mac-app', 'mac-dmg', 'mac-zip'].includes(method)) throw new Error('Installation method does not match this OS.');
  if (method === 'linux-appimage' && (!image || paths.basename(image) !== 'portal-console.AppImage')) throw new Error('Run the helper-installed AppImage before updating it.');
  return { platform, arch, method, target: method === 'linux-appimage-portable' ? image : directory };
}

function releaseAsset(release, context) {
  const version = release.tag_name?.replace(/^v/, '');
  stableVersion(version);
  const { platform, arch, method } = context;
  if (platform === 'win32' && arch !== 'x64' || platform === 'linux' && arch !== 'x64'
    || platform === 'darwin' && !['x64', 'arm64'].includes(arch)) throw new Error(`No update package for ${platform}-${arch}.`);
  const names = {
    'windows-nsis': `portal-console-${version}-win-x64-setup.exe`,
    'windows-simple': 'portal-console-simple-installer-win-x64.zip',
    'windows-portable': `portal-console-${version}-win-x64-portable.exe`,
    'linux-deb': `portal-console-${version}-linux-amd64.deb`,
    'linux-appimage': `portal-console-${version}-linux-x86_64.AppImage`,
    'linux-appimage-portable': `portal-console-${version}-linux-x86_64.AppImage`,
    'mac-dmg': `portal-console-${version}-mac-${arch}.dmg`,
    'mac-app': `portal-console-${version}-mac-${arch}.zip`,
    'mac-zip': `portal-console-${version}-mac-${arch}.zip`
  };
  const matches = release.assets.filter((asset) => asset.name === names[method]);
  if (matches.length !== 1) throw new Error('The latest release does not have the matching installer yet. Try again later.');
  const asset = matches[0];
  const expected = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${asset.name}`;
  if (asset.browser_download_url !== expected || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
    || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_PACKAGE_BYTES) throw new Error('Invalid package URL, size or SHA-256 metadata.');
  return asset;
}

async function downloadAsset(asset, file, { open = request } = {}) {
  const output = await fsp.open(file, 'wx', 0o600);
  const hash = crypto.createHash('sha256');
  let size = 0;
  const count = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    if (size > asset.size || size > MAX_PACKAGE_BYTES) { callback(new Error('Downloaded package exceeds its expected size.')); return; }
    hash.update(chunk); callback(null, chunk);
  } });
  try {
    await pipeline(await open(asset.browser_download_url), count, output.createWriteStream());
    if (size !== asset.size || `sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('Downloaded package failed size/SHA-256 verification.');
  } catch (error) { await output.close(); await fsp.rm(file, { force: true }); throw error; }
  finally { await output.close(); }
}

async function prepareUpdate(release, context, { open = request, temporaryRoot = os.tmpdir(), logFile, parentPid = process.pid, supportFiles } = {}) {
  const asset = releaseAsset(release, context);
  const work = await fsp.mkdtemp(path.join(temporaryRoot, 'portal-update-'));
  try {
    const file = path.join(work, asset.name);
    await downloadAsset(asset, file, { open });
    const helper = path.join(work, 'install-unix.sh');
    if (context.platform !== 'win32') {
      if (supportFiles) await fsp.writeFile(helper, supportFiles.helper);
      else await fsp.copyFile(path.join(__dirname, '..', 'installer', 'install-unix.sh'), helper);
    }
    const script = path.join(work, context.platform === 'win32' ? 'update.ps1' : 'update.sh');
    if (supportFiles) await fsp.writeFile(script, context.platform === 'win32' ? supportFiles.windowsRunner : supportFiles.unixRunner);
    else await fsp.copyFile(path.join(__dirname, context.platform === 'win32' ? 'update-runner.ps1' : 'update-runner.sh'), script);
    const plan = { ...context, file, work, script, helper, parentPid, digest: asset.digest.slice(7), version: release.tag_name.replace(/^v/, ''),
      logFile: logFile || path.join(os.homedir(), '.portal-console-update.log') };
    await fsp.writeFile(path.join(work, 'plan.json'), JSON.stringify(plan), { mode: 0o600 });
    return plan;
  } catch (error) { await fsp.rm(work, { recursive: true, force: true }); throw error; }
}

function workerCommand(plan, { foreground = false } = {}) {
  if (plan.platform === 'win32') return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', plan.script, '-PlanFile', path.join(plan.work, 'plan.json')] };
  return { command: '/bin/sh', args: [plan.script, String(foreground ? 0 : plan.parentPid), plan.method, plan.file, plan.target, plan.helper, plan.work, plan.logFile, plan.digest] };
}

function shellQuote(value) { return `'${value.replace(/'/g, `'"'"'`)}'`; }

async function launchUpdate(plan, { foreground = false, spawnProcess = spawn } = {}) {
  let { command, args } = workerCommand(plan, { foreground });
  if (!foreground && plan.platform === 'linux') {
    const terminals = [['x-terminal-emulator', '-e'], ['gnome-terminal', '--'], ['konsole', '-e'], ['xterm', '-e']];
    const terminal = terminals.find(([name]) => (process.env.PATH || '').split(':').some((directory) => {
      try { fs.accessSync(path.join(directory, name), fs.constants.X_OK); return true; } catch { return false; }
    }));
    if (!terminal) throw new Error('No terminal emulator found for the updater. Install xterm or run pupdate in headless mode.');
    args = [terminal[1], command, ...args]; command = terminal[0];
  } else if (!foreground && plan.platform === 'darwin') {
    const line = [command, ...args].map(shellQuote).join(' ');
    command = '/usr/bin/osascript'; args = ['-e', `tell application "Terminal" to do script ${JSON.stringify(line)}`];
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawnProcess(command, args, { detached: !foreground, stdio: foreground ? 'inherit' : 'ignore', windowsHide: false, env, cwd: os.homedir() });
  let exited = false;
  let exitCode;
  child.once('exit', (code) => { exited = true; exitCode = code; });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
  if (foreground) return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
  if (plan.platform === 'darwin') {
    const code = await new Promise((resolve) => child.once('exit', resolve));
    if (code !== 0) throw new Error('Could not start the updater in Terminal. Allow Terminal automation and retry.');
  }
  for (let attempt = 0; !fs.existsSync(path.join(plan.work, 'started')); attempt += 1) {
    if (exited && exitCode !== 0 && plan.platform !== 'darwin' || attempt >= 300) {
      if (!exited) child.kill();
      throw new Error(`The updater did not start. See ${plan.logFile}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (plan.platform !== 'darwin') child.unref();
  return 0;
}

module.exports = { REPOSITORY, newerVersion, checkForUpdate, updateContext, releaseAsset, downloadAsset, prepareUpdate, workerCommand, launchUpdate };
