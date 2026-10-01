const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG = Object.freeze({
  mode: 'original',
  fullscreen: true,
  consoles: {
    default: 'system',
    profiles: {}
  },
  original: {
    consoles: { main: null, aux: null }
  },
  logo: {
    source: null,
    characters: ' .:-=+*#%@',
    invert: false,
    characterAspectRatio: 0.6
  },
  appearance: {
    fontSize: 15,
    minimumFontSize: 8,
    maximumFontSize: 32,
    fontSizeStep: 1,
    hardwareAcceleration: false,
    mouseWheelMode: 'local',
    crt: { enabled: true, glow: 0.35, scanlines: 0.12, scanlineSpacing: 3, vignette: 0.3, glass: 0.12 }
  },
  controls: {
    closeSelectionSyntax: 'ranges'
  },
  ending: {
    source: 'auto',
    scene: null,
    portalPath: null,
    playAudio: true,
    volume: 0.1,
    volumeCurve: 'quadratic',
    bassGainDb: -8,
    compressor: false,
    seekStepMs: 5000
  },
  modern: {
    columns: ['3fr', '2fr'],
    rows: ['1fr', '1fr'],
    areas: ['main aux', 'main monitor'],
    panes: [
      { id: 'main', title: 'PRIMARY TERMINAL', kind: 'terminal' },
      { id: 'aux', title: 'AUXILIARY TERMINAL', kind: 'terminal' },
      { id: 'monitor', title: 'TERTIARY TERMINAL', kind: 'terminal' }
    ]
  }
});

const MODERN_PRESETS = Object.freeze({
  '3x2': {
    columns: ['1fr', '1fr', '1fr'],
    rows: ['1fr', '1fr'],
    areas: ['main aux third', 'fourth fifth sixth'],
    panes: [
      { id: 'main', title: 'PRIMARY TERMINAL', kind: 'terminal' },
      { id: 'aux', title: 'AUXILIARY TERMINAL', kind: 'terminal' },
      { id: 'third', title: 'TERMINAL 3', kind: 'terminal' },
      { id: 'fourth', title: 'TERMINAL 4', kind: 'terminal' },
      { id: 'fifth', title: 'TERMINAL 5', kind: 'terminal' },
      { id: 'sixth', title: 'TERMINAL 6', kind: 'terminal' }
    ]
  }
});

function configPath() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'portal-console', 'config.json');
}

function presetDirectory() {
  return path.join(path.dirname(configPath()), 'presets');
}

function presetNames() {
  const directory = presetDirectory();
  const saved = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => /^(\d+x\d+|-?\d+[+-]\d+|[cr][1-9]\d*(?:-[1-9]\d*)*)\.json$/.test(name)).map((name) => name.slice(0, -5))
    : [];
  return [...Object.keys(MODERN_PRESETS), ...saved.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
}

function generatePreset(columns, rows) {
  const areas = Array.from({ length: rows }, () => Array(columns));
  const panes = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = panes.length;
      const id = index === 0 ? 'main' : index === 1 ? 'aux' : `pane${index + 1}`;
      panes.push({ id, title: `TERMINAL ${index + 1}`, kind: 'terminal' });
      areas[y][x] = id;
    }
  }
  return {
    columns: Array(columns).fill('1fr'),
    rows: Array(rows).fill('1fr'),
    areas: areas.map((row) => row.join(' ')),
    panes
  };
}

function greatestCommonDivisor(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function generateTrackPreset(counts, direction) {
  const horizontal = direction === 'top' || direction === 'bottom';
  const trackCount = counts.length;
  const cells = counts.reduce((total, value) => total * value / greatestCommonDivisor(total, value), 1);
  const columns = horizontal ? cells : trackCount;
  const rows = horizontal ? trackCount : cells;
  const areas = Array.from({ length: rows }, () => Array(columns));
  const panes = [];
  for (let track = 0; track < trackCount; track += 1) {
    for (let cell = 0; cell < counts[track]; cell += 1) {
      const index = panes.length;
      const id = index === 0 ? 'main' : index === 1 ? 'aux' : `pane${index + 1}`;
      panes.push({ id, title: `TERMINAL ${index + 1}`, kind: 'terminal' });
      for (let offset = cell * cells / counts[track]; offset < (cell + 1) * cells / counts[track]; offset += 1) {
        if (horizontal) areas[track][offset] = id;
        else areas[offset][track] = id;
      }
    }
  }
  return {
    columns: Array(columns).fill('1fr'),
    rows: Array(rows).fill('1fr'),
    areas: areas.map((row) => row.join(' ')),
    panes
  };
}

function generateCountPreset(count, maxTracks, direction = 'left') {
  const trackCount = Math.ceil(count / maxTracks);
  const short = count - (trackCount - 1) * maxTracks;
  const shortIndex = direction === 'right' || direction === 'bottom' ? trackCount - 1 : 0;
  const counts = Array.from({ length: trackCount }, (_, index) => index === shortIndex ? short : maxTracks);
  return generateTrackPreset(counts, direction);
}

function resolvePreset(name) {
  if (name === 'modern-3x2') name = '3x2';
  if (Object.hasOwn(MODERN_PRESETS, name)) return MODERN_PRESETS[name];
  const grid = /^([1-9]\d*)x([1-9]\d*)$/.exec(name);
  const count = /^(-?)([1-9]\d*)([+-])([1-9]\d*)$/.exec(name);
  const tracks = /^([cr])([1-9]\d*(?:-[1-9]\d*)*)$/.exec(name);
  if (!grid && !count && !tracks) throw new Error(`unknown preset: ${name}`);
  const first = grid ? Number(grid[1]) : count ? Number(count[2]) : null;
  const second = grid ? Number(grid[2]) : count ? Number(count[4]) : null;
  if ((grid || count) && (first > 36 || second > 12 || (grid && first * second > 36))) {
    throw new Error('presets support up to 36 panes and 12 rows');
  }
  const sizes = tracks ? tracks[2].split('-').map(Number) : null;
  if (sizes && (sizes.length > 12 || sizes.some((size) => size > 12) || sizes.reduce((sum, size) => sum + size, 0) > 36)) {
    throw new Error('track presets support up to 12 tracks, 12 panes per track, and 36 panes total');
  }
  if (sizes) {
    const resolution = sizes.reduce((total, size) => total * size / greatestCommonDivisor(total, size), 1);
    if (resolution > 60) throw new Error('track preset resolution exceeds 60 cells; use simpler track counts');
  }
  const directory = presetDirectory();
  const file = path.join(directory, `${name}.json`);
  if (fs.existsSync(file)) {
    const preset = JSON.parse(fs.readFileSync(file, 'utf8'));
    validate({ ...DEFAULT_CONFIG, mode: 'modern', modern: preset });
    return preset;
  }
  const direction = count?.[3] === '+' ? (count[1] ? 'bottom' : 'top') : (count?.[1] ? 'right' : 'left');
  const preset = tracks ? generateTrackPreset(sizes, tracks[1] === 'c' ? 'left' : 'top')
    : grid ? generatePreset(first, second) : generateCountPreset(first, second, direction);
  validate({ ...DEFAULT_CONFIG, mode: 'modern', modern: preset });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(preset, null, 2)}\n`, { flag: 'wx' });
  return preset;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode' && argv[index + 1]) result.mode = argv[++index];
    else if (arg.startsWith('--mode=')) result.mode = arg.slice(7);
    else if (arg === '--preset' && argv[index + 1]) result.preset = argv[++index];
    else if (arg.startsWith('--preset=')) result.preset = arg.slice(9);
    else if (arg === '--preset-list') result.presetList = true;
    else if (arg === '--windowed') result.fullscreen = false;
    else if (arg === '--fullscreen') result.fullscreen = true;
    else if (arg === '--config' && argv[index + 1]) result.config = argv[++index];
    else if (arg.startsWith('--config=')) result.config = arg.slice(9);
  }
  return result;
}

function validate(config) {
  if (!['original', 'modern'].includes(config.mode)) throw new Error('mode must be "original" or "modern"');
  if (!config.consoles || typeof config.consoles.default !== 'string') throw new Error('consoles.default must be a profile name');
  if (!config.consoles.profiles || typeof config.consoles.profiles !== 'object') throw new Error('consoles.profiles must be an object');
  for (const [name, profile] of Object.entries(config.consoles.profiles)) {
    if (!name || !profile || typeof profile.command !== 'string') throw new Error('each console profile requires a command');
    if (profile.args !== undefined && !Array.isArray(profile.args)) throw new Error(`console profile ${name}.args must be an array`);
  }
  if (!config.logo || (config.logo.source !== null && typeof config.logo.source !== 'string')) throw new Error('logo.source must be a path or null');
  if (typeof config.logo.characters !== 'string' || config.logo.characters.length < 2) throw new Error('logo.characters needs at least two characters');
  if (!(config.logo.characterAspectRatio > 0 && config.logo.characterAspectRatio <= 1)) throw new Error('logo.characterAspectRatio must be between 0 and 1');
  if (!config.appearance || !Number.isFinite(config.appearance.fontSize)) throw new Error('appearance.fontSize must be a number');
  if (config.appearance.minimumFontSize < 6 || config.appearance.maximumFontSize < config.appearance.minimumFontSize) throw new Error('appearance font size range is invalid');
  if (!(config.appearance.fontSizeStep > 0)) throw new Error('appearance.fontSizeStep must be positive');
  if (typeof config.appearance.hardwareAcceleration !== 'boolean') throw new Error('appearance.hardwareAcceleration must be a boolean');
  if (!['local', 'application'].includes(config.appearance.mouseWheelMode)) throw new Error('appearance.mouseWheelMode must be local or application');
  const crt = config.appearance.crt;
  if (!crt || typeof crt !== 'object' || Array.isArray(crt) || typeof crt.enabled !== 'boolean') throw new Error('appearance.crt requires an enabled boolean');
  for (const key of ['glow', 'scanlines', 'vignette', 'glass']) {
    if (!Number.isFinite(crt[key]) || crt[key] < 0 || crt[key] > 1) throw new Error(`appearance.crt.${key} must be between 0 and 1`);
  }
  if (!Number.isInteger(crt.scanlineSpacing) || crt.scanlineSpacing < 2 || crt.scanlineSpacing > 8) throw new Error('appearance.crt.scanlineSpacing must be an integer between 2 and 8');
  if (!['ranges', 'regex'].includes(config.controls?.closeSelectionSyntax)) throw new Error('controls.closeSelectionSyntax must be ranges or regex');
  if (!config.ending || (config.ending.scene !== null && typeof config.ending.scene !== 'string')) throw new Error('ending.scene must be a path or null');
  if (!['auto', 'portal', 'demo', 'scene'].includes(config.ending.source)) throw new Error('ending.source must be auto, portal, demo, or scene');
  if (config.ending.portalPath !== null && typeof config.ending.portalPath !== 'string') throw new Error('ending.portalPath must be a path or null');
  if (typeof config.ending.playAudio !== 'boolean') throw new Error('ending.playAudio must be a boolean');
  if (!Number.isFinite(config.ending.volume) || config.ending.volume < 0 || config.ending.volume > 1) throw new Error('ending.volume must be between 0 and 1');
  if (!['linear', 'quadratic'].includes(config.ending.volumeCurve)) throw new Error('ending.volumeCurve must be linear or quadratic');
  if (!Number.isFinite(config.ending.bassGainDb) || config.ending.bassGainDb < -24 || config.ending.bassGainDb > 12) throw new Error('ending.bassGainDb must be between -24 and 12');
  if (typeof config.ending.compressor !== 'boolean') throw new Error('ending.compressor must be a boolean');
  if (!(config.ending.seekStepMs > 0 && config.ending.seekStepMs <= 60000)) throw new Error('ending.seekStepMs must be between 1 and 60000');
  const modern = config.modern;
  if (!modern || !Array.isArray(modern.columns) || !modern.columns.length) throw new Error('modern.columns must not be empty');
  if (!Array.isArray(modern.rows) || !modern.rows.length) throw new Error('modern.rows must not be empty');
  if (!Array.isArray(modern.areas) || modern.areas.length !== modern.rows.length) throw new Error('modern.areas must match modern.rows');
  const areaRows = modern.areas.map((row) => row.trim().split(/\s+/));
  if (areaRows.some((row) => row.length !== modern.columns.length)) throw new Error('each modern.areas row must match modern.columns');
  if (!Array.isArray(modern.panes) || !modern.panes.length) throw new Error('modern.panes must not be empty');
  const ids = new Set();
  for (const pane of modern.panes) {
    if (!pane.id || ids.has(pane.id)) throw new Error('modern pane ids must be present and unique');
    if (!['terminal', 'logo', 'image', 'pdf', 'web'].includes(pane.kind)) throw new Error(`unsupported pane kind: ${pane.kind}`);
    if (['image', 'pdf', 'web'].includes(pane.kind) && (typeof pane.source !== 'string' || !pane.source.trim())) {
      throw new Error(`pane ${pane.id} needs a source`);
    }
    if (pane.kind === 'web') {
      let address;
      try { address = new URL(pane.source); } catch { throw new Error(`invalid web URL for pane ${pane.id}`); }
      if (!['http:', 'https:'].includes(address.protocol)) throw new Error(`invalid web URL for pane ${pane.id}`);
    }
    if (pane.startupCommand !== undefined && (typeof pane.startupCommand !== 'string' || pane.startupCommand.length > 2048 || /[\r\n]/.test(pane.startupCommand))) {
      throw new Error(`invalid startupCommand for pane ${pane.id}`);
    }
    if (pane.appearance !== undefined) {
      const appearance = pane.appearance;
      if (!appearance || typeof appearance !== 'object' || (appearance.fontSize !== undefined && (!Number.isFinite(appearance.fontSize) || appearance.fontSize < 6 || appearance.fontSize > 72))) {
        throw new Error(`invalid appearance for pane ${pane.id}`);
      }
      for (const key of ['foreground', 'background']) {
        if (appearance[key] !== undefined && (typeof appearance[key] !== 'string' || !/^#[\da-fA-F]{6}$/.test(appearance[key]))) {
          throw new Error(`invalid ${key} color for pane ${pane.id}`);
        }
      }
    }
    ids.add(pane.id);
  }
  const unknown = areaRows.flat().find((id) => id !== '.' && !ids.has(id));
  if (unknown) throw new Error(`modern.areas references unknown pane: ${unknown}`);
  return config;
}

function loadConfig(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  const preset = cli.preset ? resolvePreset(cli.preset) : null;
  const file = cli.config || configPath();
  let stored = {};
  if (fs.existsSync(file)) stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  const config = {
    ...DEFAULT_CONFIG,
    ...stored,
    ...(cli.preset ? { mode: 'modern' } : {}),
    ...('mode' in cli ? { mode: cli.mode } : {}),
    ...('fullscreen' in cli ? { fullscreen: cli.fullscreen } : {}),
    consoles: { ...DEFAULT_CONFIG.consoles, ...(stored.consoles || {}), profiles: { ...DEFAULT_CONFIG.consoles.profiles, ...(stored.consoles?.profiles || {}) } },
    original: { ...DEFAULT_CONFIG.original, ...(stored.original || {}), consoles: { ...DEFAULT_CONFIG.original.consoles, ...(stored.original?.consoles || {}) } },
    logo: { ...DEFAULT_CONFIG.logo, ...(stored.logo || {}) },
    appearance: {
      ...DEFAULT_CONFIG.appearance, ...(stored.appearance || {}),
      crt: stored.appearance?.crt === undefined ? { ...DEFAULT_CONFIG.appearance.crt }
        : stored.appearance.crt && typeof stored.appearance.crt === 'object' && !Array.isArray(stored.appearance.crt)
          ? { ...DEFAULT_CONFIG.appearance.crt, ...stored.appearance.crt } : stored.appearance.crt
    },
    controls: { ...DEFAULT_CONFIG.controls, ...(stored.controls || {}) },
    ending: { ...DEFAULT_CONFIG.ending, ...(stored.ending || {}) },
    modern: { ...DEFAULT_CONFIG.modern, ...(stored.modern || {}), ...(preset || {}) }
  };
  return validate(config);
}

module.exports = { DEFAULT_CONFIG, MODERN_PRESETS, configPath, generatePreset, loadConfig, parseArgs, presetNames, resolvePreset, validate };
