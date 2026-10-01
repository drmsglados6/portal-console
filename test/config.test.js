const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DEFAULT_CONFIG, loadConfig, parseArgs, presetNames, validate } = require('../src/config');
const { imageToAscii } = require('../src/ascii-art');
const { rectangles, tracks } = require('../src/headless');
const { resolveConsole } = require('../src/shell');

test('command line options support both assignment forms', () => {
  assert.deepEqual(parseArgs(['--mode=modern', '--windowed', '--config', 'x.json']), {
    mode: 'modern', fullscreen: false, config: 'x.json'
  });
});

test('3x2 preset creates six equal terminal panes', () => {
  const config = loadConfig(['--config', '__missing-preset-test.json', '--preset=3x2']);
  assert.equal(config.mode, 'modern');
  assert.deepEqual(config.modern.columns, ['1fr', '1fr', '1fr']);
  assert.deepEqual(config.modern.rows, ['1fr', '1fr']);
  assert.equal(config.modern.panes.length, 6);
  assert.ok(config.modern.panes.every((pane) => pane.kind === 'terminal'));
  const rects = rectangles(config, 120, 60);
  assert.deepEqual([...rects.values()], [
    { x: 0, y: 0, width: 40, height: 30 },
    { x: 40, y: 0, width: 40, height: 30 },
    { x: 80, y: 0, width: 40, height: 30 },
    { x: 0, y: 30, width: 40, height: 30 },
    { x: 40, y: 30, width: 40, height: 30 },
    { x: 80, y: 30, width: 40, height: 30 }
  ]);
});

test('unknown presets are rejected', () => {
  assert.throws(() => loadConfig(['--preset', 'unknown']), /unknown preset/);
});

test('generated grid presets fill every cell and persist across launches', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-presets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const variable = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const previous = process.env[variable];
  process.env[variable] = directory;
  try {
    const config = loadConfig(['--config', path.join(directory, 'missing.json'), '--preset', '3x3']);
    assert.equal(config.mode, 'modern');
    assert.equal(config.modern.panes.length, 9);
    assert.deepEqual(config.modern.areas, ['main aux pane3', 'pane4 pane5 pane6', 'pane7 pane8 pane9']);
    assert.deepEqual(rectangles(config, 90, 90).get('main'), { x: 0, y: 0, width: 30, height: 30 });
    assert.ok(presetNames().includes('3x3'));
    const file = path.join(directory, 'portal-console', 'presets', '3x3.json');
    assert.ok(fs.existsSync(file));
    assert.deepEqual(loadConfig(['--config', path.join(directory, 'missing.json'), '--preset=3x3']).modern, config.modern);
    const result = spawnSync(process.execPath, ['scripts/launch.js', '--preset-list'], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', env: process.env
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^3x2$/m);
    assert.match(result.stdout, /3x3/);
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test('count presets fill the right columns and leave the leftmost with fewer panes', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-presets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const variable = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const previous = process.env[variable];
  process.env[variable] = directory;
  try {
    const config = loadConfig(['--config', path.join(directory, 'missing.json'), '--preset=5-2']);
    assert.equal(config.modern.panes.length, 5);
    assert.deepEqual(config.modern.areas, ['main aux pane4', 'main pane3 pane5']);
    assert.deepEqual(rectangles(config, 90, 60).get('main'), { x: 0, y: 0, width: 30, height: 60 });
    const seven = loadConfig(['--config', path.join(directory, 'missing.json'), '--preset=7-3']);
    assert.equal(seven.modern.panes.length, 7);
    assert.equal(seven.modern.rows.length, 3);
    assert.deepEqual(rectangles(seven, 90, 90).get('main'), { x: 0, y: 0, width: 30, height: 90 });
    assert.ok(presetNames().includes('5-2'));
    assert.ok(presetNames().includes('7-3'));
    assert.throws(() => loadConfig(['--preset=13x3']), /36 panes/);
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test('count presets can leave fewer windows at the top, right, or bottom', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-presets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const variable = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const previous = process.env[variable];
  process.env[variable] = directory;
  try {
    const options = ['--config', path.join(directory, 'missing.json')];
    const top = loadConfig([...options, '--preset', '5+2']).modern;
    const right = loadConfig([...options, '--preset', '-5-2']).modern;
    const bottom = loadConfig([...options, '--preset', '-5+2']).modern;
    assert.deepEqual(top.areas, ['main main', 'aux pane3', 'pane4 pane5']);
    assert.deepEqual(right.areas, ['main pane3 pane5', 'aux pane4 pane5']);
    assert.deepEqual(bottom.areas, ['main aux', 'pane3 pane4', 'pane5 pane5']);
    for (const name of ['5+2', '-5-2', '-5+2']) {
      assert.ok(presetNames().includes(name));
      assert.ok(fs.existsSync(path.join(directory, 'portal-console', 'presets', `${name}.json`)));
    }
    assert.deepEqual(loadConfig([...options, '--preset=-5+2']).modern, bottom);
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test('c/r presets assign panes to explicit column or row counts and persist', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-presets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const variable = process.platform === 'win32' ? 'APPDATA' : 'XDG_CONFIG_HOME';
  const previous = process.env[variable];
  process.env[variable] = directory;
  try {
    const options = ['--config', path.join(directory, 'missing.json')];
    const columns = loadConfig([...options, '--preset', 'c1-2-1']);
    assert.equal(columns.mode, 'modern');
    assert.deepEqual(columns.modern.columns, ['1fr', '1fr', '1fr']);
    assert.deepEqual(columns.modern.rows, ['1fr', '1fr']);
    assert.deepEqual(columns.modern.areas, ['main aux pane4', 'main pane3 pane4']);
    assert.deepEqual(rectangles(columns, 90, 60).get('main'), { x: 0, y: 0, width: 30, height: 60 });
    assert.deepEqual(rectangles(columns, 90, 60).get('pane4'), { x: 60, y: 0, width: 30, height: 60 });
    const rows = loadConfig([...options, '--preset=r1-2-1']);
    assert.deepEqual(rows.modern.columns, ['1fr', '1fr']);
    assert.deepEqual(rows.modern.rows, ['1fr', '1fr', '1fr']);
    assert.deepEqual(rows.modern.areas, ['main main', 'aux pane3', 'pane4 pane4']);
    assert.deepEqual(rectangles(rows, 60, 90).get('pane4'), { x: 0, y: 60, width: 60, height: 30 });
    for (const name of ['c1-2-1', 'r1-2-1']) {
      assert.ok(presetNames().includes(name));
      assert.ok(fs.existsSync(path.join(directory, 'portal-console', 'presets', `${name}.json`)));
    }
    assert.deepEqual(loadConfig([...options, '--preset=c1-2-1']).modern, columns.modern);
    assert.throws(() => loadConfig([...options, '--preset=c0-2']), /unknown preset/);
    assert.throws(() => loadConfig([...options, '--preset=c5-7-11']), /resolution exceeds/);
    assert.throws(() => loadConfig([...options, '--preset=r12-12-12-1']), /36 panes/);
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test('default configuration is valid', () => {
  assert.equal(validate(DEFAULT_CONFIG).mode, 'original');
});

test('invalid area references are rejected', () => {
  assert.throws(() => validate({ ...DEFAULT_CONFIG, modern: { ...DEFAULT_CONFIG.modern, areas: ['main missing', 'main monitor'] } }), /unknown pane/);
});

test('fractional tracks consume all available cells', () => {
  assert.deepEqual(tracks(['3fr', '1fr'], 80), [60, 20]);
});

test('original rectangles fill the screen in three regions', () => {
  const rects = rectangles(DEFAULT_CONFIG, 120, 60);
  assert.deepEqual(rects.get('main'), { x: 0, y: 0, width: 60, height: 60 });
  assert.deepEqual(rects.get('aux'), { x: 60, y: 0, width: 60, height: 30 });
  assert.deepEqual(rects.get('logo'), { x: 60, y: 30, width: 60, height: 30 });
});

test('custom console profiles can be selected as the default', () => {
  const config = {
    ...DEFAULT_CONFIG,
    consoles: { default: 'custom', profiles: { custom: { command: 'test-shell', args: ['-i'], cwd: '~' } } }
  };
  const profile = resolveConsole(config, 'main');
  assert.equal(profile.command, 'test-shell');
  assert.deepEqual(profile.args, ['-i']);
});

test('modern panes can override the default console', () => {
  const config = {
    ...DEFAULT_CONFIG,
    consoles: { default: 'system', profiles: { special: { command: 'special-shell' } } },
    modern: { ...DEFAULT_CONFIG.modern, panes: DEFAULT_CONFIG.modern.panes.map((pane) => pane.id === 'aux' ? { ...pane, console: 'special' } : pane) }
  };
  assert.equal(resolveConsole(config, 'aux').command, 'special-shell');
});

test('the Windows system console defaults to PowerShell', { skip: process.platform !== 'win32' }, () => {
  const profile = resolveConsole(DEFAULT_CONFIG, 'main');
  assert.equal(profile.command, 'powershell.exe');
  assert.deepEqual(profile.args, ['-NoLogo']);
});

test('the bundled logo is converted to bounded ASCII art', async () => {
  const art = await imageToAscii(DEFAULT_CONFIG.logo, 40, 12);
  const lines = art.split('\n');
  assert.ok(lines.length <= 12);
  assert.ok(Math.max(...lines.map((line) => line.length)) <= 40);
  assert.match(art, /[@#*+=-]/);
});

test('ASCII conversion compensates for narrow character cells', async () => {
  const art = await imageToAscii(DEFAULT_CONFIG.logo, 60, 30);
  const lines = art.split('\n');
  const occupied = [];
  lines.forEach((line, y) => [...line].forEach((character, x) => { if (character !== ' ') occupied.push({ x, y }); }));
  const characterWidth = Math.max(...occupied.map(({ x }) => x)) - Math.min(...occupied.map(({ x }) => x)) + 1;
  const characterHeight = Math.max(...occupied.map(({ y }) => y)) - Math.min(...occupied.map(({ y }) => y)) + 1;
  const visualAspect = characterWidth * DEFAULT_CONFIG.logo.characterAspectRatio / characterHeight;
  assert.ok(visualAspect > 0.85 && visualAspect < 1.15, `visual aspect was ${visualAspect}`);
});
