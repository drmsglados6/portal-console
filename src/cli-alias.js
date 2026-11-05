const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NAME = 'pconsole';
const MARKER = '@rem Portal Console launcher';

function sameFile(left, right) {
  try { return fs.realpathSync(left) === fs.realpathSync(right); }
  catch { return false; }
}

function ownedAlias(file, target, platform) {
  try {
    if (platform === 'win32') return fs.readFileSync(file, 'utf8') === `${MARKER}\r\n@"${target}" %*\r\n`;
    return fs.lstatSync(file).isSymbolicLink() && path.resolve(path.dirname(file), fs.readlinkSync(file)) === path.resolve(target);
  } catch { return false; }
}

function registerAlias(target, directory, { platform = process.platform, searchPath = process.env.PATH || '' } = {}) {
  const file = path.join(directory, platform === 'win32' ? `${NAME}.cmd` : NAME);
  const extensions = platform === 'win32' ? ['', '.exe', '.com', '.cmd', '.bat', '.ps1'] : [''];
  // Do not shadow an existing executable, including one later in PATH.
  for (const location of [directory, ...searchPath.split(platform === 'win32' ? ';' : ':').filter(Boolean)]) {
    for (const extension of extensions) {
      const candidate = path.join(location.replace(/^"|"$/g, ''), `${NAME}${extension}`);
      try {
        fs.lstatSync(candidate);
        if (ownedAlias(candidate, target, platform) || sameFile(candidate, target)) continue;
        return { installed: false, conflict: candidate };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  fs.mkdirSync(directory, { recursive: true });
  if (!ownedAlias(file, target, platform)) {
    if (platform === 'win32') fs.writeFileSync(file, `${MARKER}\r\n@"${target}" %*\r\n`, { flag: 'wx' });
    else fs.symlinkSync(target, file);
  }
  return { installed: true, file };
}

function removeAlias(target, directory, platform = process.platform) {
  const file = path.join(directory, platform === 'win32' ? `${NAME}.cmd` : NAME);
  if (ownedAlias(file, target, platform)) fs.unlinkSync(file);
}

function windowsPath(directory, remove = false) {
  const record = path.join(directory, '.pconsole-path.json');
  let added = false;
  try { added = JSON.parse(fs.readFileSync(record, 'utf8')).added === true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (remove && !added) {
    if (fs.existsSync(record)) fs.unlinkSync(record);
    return;
  }
  const script = `
    $ErrorActionPreference = 'Stop'
    $directory = $env:PCONSOLE_CLI_DIRECTORY
    $value = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($value -split ';' | Where-Object { $_ })
    $present = @($entries | Where-Object { $_.TrimEnd('\\') -ieq $directory.TrimEnd('\\') }).Count -gt 0
    if (${remove ? '$true' : '$false'}) {
      $entries = @($entries | Where-Object { $_.TrimEnd('\\') -ine $directory.TrimEnd('\\') })
      [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
    } elseif (!$present) {
      [Environment]::SetEnvironmentVariable('Path', (($entries + $directory) -join ';'), 'User')
      'added'
    }
  `;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, PCONSOLE_CLI_DIRECTORY: directory }, encoding: 'utf8', windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  if (remove) fs.unlinkSync(record);
  else fs.writeFileSync(record, JSON.stringify({ added: added || result.stdout.trim() === 'added' }));
}

module.exports = { registerAlias, removeAlias, windowsPath };
