const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
let registryEnvironmentNames = new Set();
let lastEnvironmentRefresh = 0;

const BUILT_INS = {
  cmd: { win32: { command: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe', args: [] } },
  powershell: { win32: { command: 'powershell.exe', args: ['-NoLogo'] } },
  pwsh: { win32: { command: 'pwsh.exe', args: ['-NoLogo'] }, unix: { command: 'pwsh', args: ['-NoLogo'] } },
  cygwin: { win32: { command: 'C:\\cygwin64\\bin\\bash.exe', args: ['--login', '-i'] } },
  bash: { win32: { command: 'bash.exe', args: ['--login', '-i'] }, unix: { command: '/bin/bash', args: ['-l'] } },
  zsh: { unix: { command: '/bin/zsh', args: ['-l'] } },
  fish: { unix: { command: '/usr/bin/fish', args: ['-l'] } }
};

function systemProfile() {
  if (process.platform === 'win32') return { command: 'powershell.exe', args: ['-NoLogo'] };
  return { command: process.env.SHELL || '/bin/sh', args: ['-l'] };
}

function expandHome(value) {
  if (!value) return os.homedir();
  return value === '~' ? os.homedir() : value.startsWith(`~${path.sep}`) ? path.join(os.homedir(), value.slice(2)) : value;
}

function profileName(config, paneId) {
  const original = config.original?.consoles?.[paneId];
  const modern = config.modern?.panes?.find((pane) => pane.id === paneId)?.console;
  return modern || original || config.consoles.default;
}

function resolveConsole(config, paneId) {
  const name = profileName(config, paneId);
  if (name === 'system') return { name, ...systemProfile(), cwd: os.homedir() };
  const custom = config.consoles.profiles[name];
  const builtIn = BUILT_INS[name]?.[process.platform === 'win32' ? 'win32' : 'unix'];
  const selected = custom || builtIn;
  if (!selected) throw new Error(`Console profile "${name}" is not available on ${process.platform}`);
  return { name, command: selected.command, args: selected.args || [], cwd: expandHome(selected.cwd) };
}

async function refreshEnvironment(force = false) {
  if (process.platform !== 'win32') return 0;
  if (!force && Date.now() - lastEnvironmentRefresh < 1000) return registryEnvironmentNames.size;
  const script = [
    "$m=[Environment]::GetEnvironmentVariables('Machine')",
    "$u=[Environment]::GetEnvironmentVariables('User')",
    '$r=@{}',
    '$m.GetEnumerator()|ForEach-Object{$r[$_.Key]=$_.Value}',
    '$u.GetEnumerator()|ForEach-Object{$r[$_.Key]=$_.Value}',
    "if($m['Path'] -or $u['Path']){$r['Path']=(($m['Path'],$u['Path']|Where-Object{$_}) -join ';')}",
    '$r|ConvertTo-Json -Compress'
  ].join(';');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  const environment = JSON.parse(stdout.trim().replace(/^\uFEFF/, ''));
  const nextNames = new Set(Object.keys(environment).map((name) => name.toUpperCase()));
  for (const name of registryEnvironmentNames) if (!nextNames.has(name)) delete process.env[name];
  for (const [name, value] of Object.entries(environment)) process.env[name] = String(value);
  registryEnvironmentNames = nextNames;
  lastEnvironmentRefresh = Date.now();
  return registryEnvironmentNames.size;
}

function spawnOptions(cols, rows, cwd = os.homedir()) {
  return {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  };
}

module.exports = { BUILT_INS, profileName, refreshEnvironment, resolveConsole, spawnOptions };
