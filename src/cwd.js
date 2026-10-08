const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { fileURLToPath } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function cwdTracker(initial, token = '', onlyOwnReports = false) {
  let buffered = '';
  let value = initial;
  let reported = false;
  return {
    get value() { return value; },
    get reported() { return reported; },
    feed(data) {
      buffered += data;
      const matches = /\x1b\](?:7;([^\x07\x1b]*)|1337;PortalConsoleCwd=([^\x07\x1b]*))(?:\x07|\x1b\\)/g;
      let match, end = 0;
      while ((match = matches.exec(buffered))) {
        end = matches.lastIndex;
        try {
          let directory;
          if (match[2] !== undefined) {
            if (!token || !match[2].startsWith(`${token}:`)) continue;
            const payload = match[2].slice(token.length + 1);
            if (payload.startsWith('b64:')) directory = Buffer.from(payload.slice(4), 'base64').toString('utf8');
            else if (payload.startsWith('raw:')) directory = payload.slice(4);
          } else {
            if (onlyOwnReports) continue;
            const url = new URL(match[1]);
            if (url.protocol !== 'file:' || !['', 'localhost', os.hostname().toLowerCase()].includes(url.hostname.toLowerCase())) continue;
            url.hostname = '';
            directory = fileURLToPath(url);
          }
          if (typeof directory === 'string' && path.isAbsolute(directory) && !directory.includes('\0')) { value = directory; reported = true; }
        } catch {}
      }
      buffered = buffered.slice(end);
      const start = Math.max(buffered.lastIndexOf('\x1b]7;'), buffered.lastIndexOf('\x1b]1337;PortalConsoleCwd='));
      buffered = start >= 0 ? buffered.slice(start) : buffered.slice(-32);
      if (buffered.length > 32768) buffered = buffered.slice(-32);
    }
  };
}

function isDirectory(directory) {
  try { return !!directory && fs.statSync(directory).isDirectory(); } catch { return false; }
}

async function currentDirectory(child, tracker, authoritative = false) {
  if (authoritative && tracker.reported) {
    if (!isDirectory(tracker.value)) throw new Error('Current directory is unavailable. Use Shift+R / --reset-cwd to reset it.');
    return tracker.value;
  }
  let native;
  if (child?.pid && process.platform === 'linux') {
    try { native = fs.readlinkSync(`/proc/${child.pid}/cwd`); } catch {}
  } else if (child?.pid && process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-a', '-p', String(child.pid), '-d', 'cwd', '-Fn'], { timeout: 3000, maxBuffer: 65536 });
      native = stdout.split('\n').find((line) => line.startsWith('n'))?.slice(1);
    } catch {}
  }
  if (native) {
    if (!isDirectory(native)) throw new Error('Current directory is unavailable. Use Shift+R / --reset-cwd to reset it.');
    if (isDirectory(tracker.value)) {
      try { if (fs.realpathSync(native) === fs.realpathSync(tracker.value)) return tracker.value; } catch {}
    }
    return native;
  }
  if (isDirectory(tracker.value)) return tracker.value;
  throw new Error('Could not determine a valid working directory. Use Shift+R / --reset-cwd.');
}

module.exports = { cwdTracker, currentDirectory };
