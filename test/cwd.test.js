const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { cwdTracker, currentDirectory } = require('../src/cwd');
const { prepareConsole } = require('../src/shell');
const { spawn } = require('node:child_process');

test('cwd tracker handles fragmented OSC paths, token validation and remote hosts', () => {
  const original = os.homedir(), directory = os.tmpdir();
  const tracker = cwdTracker(original, 'token');
  tracker.feed('\x1b]7;');
  tracker.feed(`${pathToFileURL(directory).href}\x1b`);
  tracker.feed('\\');
  assert.equal(tracker.value, directory);
  tracker.feed('\x1b]7;file://remote-host/not-local\x07');
  assert.equal(tracker.value, directory);
  tracker.feed(`\x1b]1337;PortalConsoleCwd=wrong:b64:${Buffer.from(original).toString('base64')}\x07`);
  assert.equal(tracker.value, directory);
  tracker.feed(`\x1b]1337;PortalConsoleCwd=token:b64:${Buffer.from(original).toString('base64')}\x07`);
  assert.equal(tracker.value, original);
});

test('PowerShell cwd integration preserves profile arguments and applies retained cwd after startup', () => {
  const profile = { command: 'powershell.exe', args: ['-NoLogo'], cwd: os.homedir() };
  const prepared = prepareConsole(profile, 80, 24, os.tmpdir());
  assert.equal(prepared.options.cwd, os.tmpdir());
  assert.equal(prepared.options.env.PORTAL_CONSOLE_START_CWD, os.tmpdir());
  assert.ok(prepared.args.includes('-NoLogo'));
  assert.ok(prepared.args.includes('-NoExit'));
  assert.match(prepared.args.at(-1), /PortalConsoleSavedPrompt/);
  assert.equal(prepareConsole(profile, 80, 24).options.env.PORTAL_CONSOLE_START_CWD, undefined);
});

test('deleted reported directory does not silently reset a retaining restart', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-cwd-'));
  const tracker = cwdTracker(directory, 'token');
  tracker.feed(`\x1b]1337;PortalConsoleCwd=token:b64:${Buffer.from(directory).toString('base64')}\x07`);
  fs.rmdirSync(directory);
  await assert.rejects(currentDirectory(null, tracker, true), /reset-cwd/);
});

test('Unix restart queries the live process directory including spaces and Unicode', { skip: process.platform === 'win32' }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-cwd-日本語 '));
  const child = spawn(process.execPath, ['-e', "process.chdir(process.argv[1]);console.log('READY');setInterval(()=>{},1000)", directory], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); fs.rmSync(directory, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
  const current = await currentDirectory(child, cwdTracker(os.homedir()));
  assert.equal(fs.realpathSync(current), fs.realpathSync(directory));
});
