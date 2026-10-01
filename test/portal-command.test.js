const test = require('node:test');
const assert = require('node:assert/strict');
const { portalCommandInput, portalExitInput } = require('../src/portal-command');
const { remapPreset } = require('../src/preset-switch');
const { MODERN_PRESETS, generatePreset, validate, DEFAULT_CONFIG } = require('../src/config');

test('portal-exit is recognized when entered as a complete command', () => {
  const input = portalExitInput();
  assert.equal(input('portal-'), false);
  assert.equal(input('exit'), false);
  assert.equal(input('\r'), true);
  assert.equal(input('portal-exit\n'), true);
});

test('other commands, editing and terminal controls do not trigger a quit', () => {
  const input = portalExitInput();
  assert.equal(input('echo portal-exit\r'), false);
  assert.equal(input('portal-exit-extra\r'), false);
  assert.equal(input('portal-exit\x1b[D\r'), false);
  assert.equal(input('portal-exit\x03\r'), false);
  assert.equal(input('portal-exitx\x7f\r'), true);
});

test('terminal focus notifications do not invalidate a typed command', () => {
  const input = portalExitInput();
  assert.equal(input('\x1b[O'), false);
  assert.equal(input('\x1b[I'), false);
  assert.equal(input('portal-exit'), false);
  assert.equal(input('\x1b[O'), false);
  assert.equal(input('\x1b[I'), false);
  assert.equal(input('\r'), true);
});

test('terminal device replies and a preset transition leave the next command usable', () => {
  const input = portalCommandInput();
  assert.equal(input('portal-preset 2x2\r')?.type, 'preset');
  assert.equal(input('\x1b[?1;2c'), null);
  assert.equal(input('\x1b[O'), null);
  assert.equal(input('portal-preset c5'), null);
  assert.equal(input('\x1b[I'), null);
  assert.deepEqual(input('-2-3\r'), { type: 'preset', name: 'c5-2-3' });
  assert.deepEqual(input('portal-exit\r'), { type: 'exit' });
});

test('a stray cursor sequence before typing does not block the next internal command', () => {
  const input = portalCommandInput();
  assert.equal(input('\x1b[D'), null);
  assert.deepEqual(input('portal-preset c5-2-3\r'), { type: 'preset', name: 'c5-2-3' });
  assert.equal(input('portal-preset 5-2-3\r')?.type, 'preset');
  assert.deepEqual(input('portal-exit\r'), { type: 'exit' });
});

test('terminal color replies do not become part of a command', () => {
  const input = portalCommandInput();
  assert.equal(input('\x1b]10;rgb:ff/99/22'), null);
  assert.equal(input('\x07'), null);
  assert.deepEqual(input('portal-preset c1-2-1\r'), { type: 'preset', name: 'c1-2-1' });
});

test('portal-preset recognizes a preset name without passing Enter to the shell', () => {
  const input = portalCommandInput();
  assert.equal(input('\x1b[I'), null);
  assert.equal(input('portal-preset 5-2'), null);
  assert.deepEqual(input('\r'), { type: 'preset', name: '5-2' });
  assert.equal(input('echo portal-preset 2x2\r'), null);
});

test('portal-help is an internal command', () => {
  assert.deepEqual(portalCommandInput()('portal-help\r'), { type: 'help' });
});

test('portal-restart is recognized only as a standalone command', () => {
  assert.deepEqual(portalCommandInput()('portal-restart\r'), { type: 'restart' });
  assert.equal(portalCommandInput()('echo portal-restart\r'), null);
});

test('switching to fewer panes keeps the selected survivors in order', () => {
  const current = MODERN_PRESETS['3x2'];
  const target = generatePreset(2, 2);
  const { layout, closedIds } = remapPreset(current, target, [2, 5]);
  assert.deepEqual(closedIds, ['aux', 'fifth']);
  assert.deepEqual(layout.panes.map((pane) => pane.id), ['main', 'third', 'fourth', 'sixth']);
  assert.deepEqual(layout.panes.map((pane) => pane.title), ['TERMINAL 1', 'TERMINAL 2', 'TERMINAL 3', 'TERMINAL 4']);
  assert.deepEqual(layout.areas, ['main third', 'fourth sixth']);
  validate({ ...DEFAULT_CONFIG, modern: layout });
  assert.throws(() => remapPreset(current, target, [1, 1]), /Select exactly/);
});

test('switching to more panes retains sessions and allocates new unique ids', () => {
  const previous = generatePreset(2, 2);
  const { layout, closedIds } = remapPreset(previous, MODERN_PRESETS['3x2'], [], ['main', 'aux', 'session1']);
  assert.deepEqual(closedIds, []);
  assert.deepEqual(layout.panes.slice(0, 4).map((pane) => pane.id), previous.panes.map((pane) => pane.id));
  assert.deepEqual(layout.panes.slice(4).map((pane) => pane.id), ['session2', 'session3']);
  validate({ ...DEFAULT_CONFIG, modern: layout });
});

test('a destination slot supplies new per-pane settings without replacing a retained session', () => {
  const previous = generatePreset(2, 1);
  const target = generatePreset(2, 1);
  target.panes[0].appearance = { fontSize: 18, foreground: '#00ff00', background: '#101010' };
  target.panes[0].startupCommand = 'echo READY';
  const { layout } = remapPreset(previous, target);
  assert.equal(layout.panes[0].id, previous.panes[0].id);
  assert.deepEqual(layout.panes[0].appearance, target.panes[0].appearance);
  assert.equal(layout.panes[0].startupCommand, 'echo READY');
  validate({ ...DEFAULT_CONFIG, modern: layout });
  assert.throws(() => validate({ ...DEFAULT_CONFIG, modern: { ...target, panes: [{ ...target.panes[0], startupCommand: 'one\ntwo' }, target.panes[1]] } }), /startupCommand/);
});

test('a media slot replaces its terminal without reusing its PTY id', () => {
  const current = generatePreset(2, 1);
  const target = generatePreset(2, 1);
  target.panes[1] = { id: 'aux', kind: 'image', title: 'LOGO', source: 'assets/aperture-science.svg' };
  const { layout, closedIds, replacedIds } = remapPreset(current, target, [], current.panes.map((pane) => pane.id));
  assert.deepEqual(closedIds, ['aux']);
  assert.deepEqual(replacedIds, ['aux']);
  assert.equal(layout.panes[0].id, 'main');
  assert.equal(layout.panes[1].kind, 'image');
  assert.notEqual(layout.panes[1].id, 'aux');
  validate({ ...DEFAULT_CONFIG, modern: layout });
  assert.throws(() => validate({ ...DEFAULT_CONFIG, modern: { ...target, panes: [target.panes[0], { ...target.panes[1], source: null }] } }), /needs a source/);
});
