const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const { KINDS, EXTENSIONS } = require('./media-command');

function needsMediaBase(source) {
  return typeof source === 'string' && !/^(?:https?:\/\/|file:)/i.test(source) &&
    (!path.isAbsolute(source) || process.platform === 'win32' && /^[\\/](?![\\/])/.test(source));
}

function normalizeSource(kind, source, baseDirectory = process.cwd()) {
  if (!KINDS.includes(kind) || typeof source !== 'string' || !source.trim() || source.length > 8192) throw new Error('Invalid media kind/source');
  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    const rawName = url.pathname.split('/').pop() || url.hostname;
    let name; try { name = decodeURIComponent(rawName); } catch { name = rawName; }
    return { source: url.href, url: url.href, remote: true, name };
  }
  if (kind === 'web') throw new Error('Web panes require a complete http:// or https:// URL.');
  if (/^[a-z][\w+.-]*:/i.test(source) && !/^[a-z]:[\\/]/i.test(source) && !source.startsWith('file:')) throw new Error('Only local files and http(s) links are supported.');
  if (typeof baseDirectory !== 'string' || !path.isAbsolute(baseDirectory)) throw new Error('Invalid media base directory');
  const file = source.startsWith('file:') ? fileURLToPath(source) : path.resolve(baseDirectory, source);
  if (!fs.statSync(file).isFile()) throw new Error('Media source is not a file.');
  return { source: file, url: pathToFileURL(file).href, remote: false, name: path.basename(file) };
}

function resolveMedia(kind, source, sort = 'name', descending = false, baseDirectory = process.cwd()) {
  if (!['name', 'modified', 'size'].includes(sort) || typeof descending !== 'boolean') throw new Error('Invalid file ordering');
  const info = normalizeSource(kind, source, baseDirectory);
  if (info.remote || kind === 'web') return { ...info, kind, files: [info.source], index: 0, sort, descending };
  const directory = path.dirname(info.source);
  const candidates = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!EXTENSIONS[kind].includes(path.extname(entry.name).toLowerCase()) || !entry.isFile() && !entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    try {
      const stat = sort === 'name' && entry.isFile() ? null : fs.statSync(file);
      if (stat && !stat.isFile()) continue;
      candidates.push({ file, name: entry.name, value: sort === 'size' ? stat.size : sort === 'modified' ? stat.mtimeMs : 0 });
    } catch {}
  }
  if (!candidates.some((entry) => entry.file === info.source)) {
    const stat = sort === 'name' ? null : fs.statSync(info.source);
    candidates.push({ file: info.source, name: info.name, value: sort === 'size' ? stat.size : sort === 'modified' ? stat.mtimeMs : 0 });
  }
  const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
  candidates.sort((a, b) => (sort === 'name' ? 0 : a.value - b.value) || compare(a.name, b.name));
  if (descending) candidates.reverse();
  const files = candidates.map((entry) => entry.file);
  return { ...info, kind, files, index: files.indexOf(info.source), sort, descending };
}

module.exports = { normalizeSource, resolveMedia, needsMediaBase };
