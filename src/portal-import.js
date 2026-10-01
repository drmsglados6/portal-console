const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { VpkReader } = require('vpk-tools');
const { validateScene } = require('./ending-scene');

function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.includes(0)) return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function tokenizeVdf(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source[index] === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index);
      if (index < 0) break;
      continue;
    }
    if (source[index] === '[') {
      const end = source.indexOf(']', index + 1);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source[index] === '{' || source[index] === '}') {
      tokens.push(source[index++]);
      continue;
    }
    if (source[index] !== '"') throw new Error(`Unexpected VDF token at offset ${index}`);
    index += 1;
    let value = '';
    while (index < source.length && source[index] !== '"') {
      if (source[index] === '\\' && index + 1 < source.length) {
        const escaped = source[++index];
        value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
      } else value += source[index];
      index += 1;
    }
    if (source[index] !== '"') throw new Error('Unterminated VDF string');
    index += 1;
    tokens.push(value);
  }
  return tokens;
}

function parseVdf(source) {
  const tokens = tokenizeVdf(source);
  let index = 0;
  function object(expectClosing) {
    const entries = [];
    while (index < tokens.length) {
      if (tokens[index] === '}') {
        if (!expectClosing) throw new Error('Unexpected VDF closing brace');
        index += 1;
        return entries;
      }
      const key = tokens[index++];
      if (typeof key !== 'string' || key === '{') throw new Error('Invalid VDF key');
      if (tokens[index] === '{') {
        index += 1;
        entries.push({ key, value: object(true) });
      } else {
        if (typeof tokens[index] !== 'string') throw new Error(`Missing VDF value for ${key}`);
        entries.push({ key, value: tokens[index++] });
      }
    }
    if (expectClosing) throw new Error('Missing VDF closing brace');
    return entries;
  }
  return object(false);
}

function section(entries, name) {
  const match = entries.find((entry) => entry.key.toLowerCase() === name.toLowerCase());
  if (!match || !Array.isArray(match.value)) throw new Error(`Portal credits section missing: ${name}`);
  return match.value;
}

function values(entries) {
  return new Map(entries.filter((entry) => typeof entry.value === 'string').map((entry) => [entry.key.toLowerCase(), entry.value]));
}

function steamRoots() {
  const roots = [];
  if (process.platform === 'win32') roots.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  else if (process.platform === 'darwin') roots.push(path.join(os.homedir(), 'Library/Application Support/Steam'));
  else roots.push(path.join(os.homedir(), '.steam/steam'), path.join(os.homedir(), '.local/share/Steam'));
  const expanded = new Set(roots);
  for (const root of roots) {
    const libraries = path.join(root, 'steamapps/libraryfolders.vdf');
    if (!fs.existsSync(libraries)) continue;
    const source = fs.readFileSync(libraries, 'utf8');
    for (const match of source.matchAll(/"path"\s*"([^"]+)"/g)) expanded.add(match[1].replace(/\\\\/g, '\\'));
  }
  return [...expanded];
}

function findPortalPath(preferred) {
  const candidates = preferred ? [path.resolve(preferred)] : steamRoots().flatMap((root) => [
    path.join(root, 'steamapps/common/Portal'),
    path.join(root, 'common/Portal')
  ]);
  for (const candidate of candidates) {
    const root = path.basename(candidate).toLowerCase() === 'portal' && fs.existsSync(path.join(candidate, 'portal'))
      ? candidate
      : path.dirname(candidate);
    const vpk = path.join(root, 'portal/portal_pak_dir.vpk');
    if (fs.existsSync(vpk)) return { root, vpk };
    const directVpk = path.join(candidate, 'portal_pak_dir.vpk');
    if (fs.existsSync(directVpk)) return { root: path.dirname(candidate), vpk: directVpk };
  }
  throw new Error('Portal installation was not found in the configured path or Steam libraries');
}

function parseTimedValue(value) {
  const match = /^\[([^\]]+)\](.*)$/s.exec(value);
  if (!match) throw new Error('Portal credit event is missing its timing prefix');
  const seconds = Number.parseFloat(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Invalid Portal credit time: ${match[1]}`);
  return { durationMs: seconds * 1000, text: match[2] };
}

function importPortalCredits(options = {}) {
  const installation = findPortalPath(options.portalPath);
  const vpk = VpkReader.open(installation.vpk);
  try {
    const source = decodeText(vpk.readFile('scripts/credits.txt'));
    const parsed = parseVdf(source);
    const root = section(parsed, 'credits.txt');
    const params = values(section(root, 'CreditsParams'));
    const lyricsSource = section(root, 'OutroSongLyrics').map((entry) => entry.key);
    const creditsSource = section(root, 'OutroCreditsNames').map((entry) => entry.key);
    const artSource = section(root, 'OutroAsciiArt').map((entry) => entry.value);

    const translations = new Map();
    const looseTranslation = path.join(installation.root, 'portal/resource/portal_english.txt');
    let translationSource;
    if (fs.existsSync(looseTranslation)) translationSource = decodeText(fs.readFileSync(looseTranslation));
    else if (vpk.has('resource/portal_english.txt')) translationSource = decodeText(vpk.readFile('resource/portal_english.txt'));
    if (translationSource) {
      const translationRoot = parseVdf(translationSource);
      const language = section(translationRoot, 'lang');
      for (const entry of section(language, 'Tokens')) if (typeof entry.value === 'string') translations.set(entry.key.toLowerCase(), entry.value);
    }
    const translate = (text) => text.replace(/#([a-zA-Z0-9_]+)/g, (original, token) => translations.get(token.toLowerCase()) || original);

    const frames = { 0: '' };
    for (const encoded of artSource) {
      const { durationMs: numericId, text } = parseTimedValue(encoded);
      const id = String(Math.trunc(numericId / 1000));
      frames[id] = frames[id] ? `${frames[id]}\n${text}` : text;
    }

    const left = [];
    const art = [];
    let currentTime = 0;
    for (const encoded of lyricsSource) {
      const segment = parseTimedValue(encoded);
      let text = segment.text;
      const artMatch = /^<<<(\d+)>>>(.*)$/s.exec(text);
      if (artMatch) {
        art.push({ at: currentTime, frame: artMatch[1] });
        text = artMatch[2];
      }
      const delayOnly = text === ' ';
      const clear = text === '&';
      const markerOnly = text === '^';
      let newLine = !delayOnly;
      if (!clear && !delayOnly && !markerOnly) {
        if (text.startsWith('*')) {
          newLine = false;
          text = text.slice(1);
        }
        text = translate(text);
        left.push({ at: currentTime, type: 'type', durationMs: segment.durationMs, text: text + (newLine ? '\n' : '') });
      }
      currentTime += segment.durationMs;
      if (clear) left.push({ at: currentTime, type: 'clear' });
      else if (markerOnly) left.push({ at: currentTime, type: 'type', durationMs: 0, text: '\n' });
    }
    // The game leaves this region blank until its first cue. Keep the locally
    // sourced Aperture frame visible so the dedicated AA pane is unambiguous.
    if (frames['1']) art.unshift({ at: 0, frame: '1' });

    const creditStart = Number.parseFloat(params.get('scrollcreditsstart')) * 1000;
    const creditDuration = Number.parseFloat(params.get('scrolltime')) * 1000;
    const totalCharacters = creditsSource.reduce((total, line) => total + line.length + 1, 0);
    let consumed = 0;
    const credits = creditsSource.map((line) => {
      const at = creditStart + creditDuration * consumed / totalCharacters;
      const durationMs = creditDuration * (line.length + 1) / totalCharacters;
      consumed += line.length + 1;
      return { at, durationMs, text: line.trim() ? line : '' };
    });
    const end = Math.max(currentTime, creditStart + creditDuration) + 5000;
    const colorParts = (params.get('color') || '255 182 0 255').split(/\s+/).slice(0, 3).map(Number);
    const color = `#${colorParts.map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, '0')).join('')}`;
    const scene = validateScene({
      version: 1,
      title: 'PORTAL - STILL ALIVE',
      color,
      durationMs: Math.ceil(end),
      audioStartMs: Number.parseFloat(params.get('songstarttime')) * 1000,
      left,
      credits,
      frames,
      art
    });
    const audio = options.playAudio === false ? null : vpk.readFile('sound/music/portal_still_alive.mp3');
    if (audio && audio.length > 20 * 1024 * 1024) throw new Error('Portal ending audio exceeds the safety limit');
    return { scene, audio, source: 'portal', portalPath: installation.root };
  } finally {
    vpk.close();
  }
}

module.exports = { findPortalPath, importPortalCredits, parseVdf, tokenizeVdf };
