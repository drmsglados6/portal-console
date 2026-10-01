const test = require('node:test');
const assert = require('node:assert/strict');
const { headlessInput } = require('../src/headless-input');
const { helpSections, helpLines } = require('../src/help');
const { DEFAULT_CONFIG } = require('../src/config');

test('headless prefix keys survive both combined and split stdin chunks', () => {
  const input = headlessInput();
  assert.deepEqual(input('abc\x02p\x02Ndef'), [
    { type: 'data', data: 'abc' }, { type: 'prefix', key: 'p' },
    { type: 'prefix', key: 'N' }, { type: 'data', data: 'def' }
  ]);
  assert.deepEqual(input('\x02'), []);
  assert.deepEqual(input('P'), [{ type: 'prefix', key: 'P' }]);
  assert.deepEqual(input('\x02\x02\x1b[A'), [{ type: 'prefix', key: '\x02' }, { type: 'data', data: '\x1b[A' }]);
});

test('frontend help documents restart and differentiates live layout support', () => {
  const headless = helpLines(helpSections('headless', DEFAULT_CONFIG), 40);
  assert.ok(headless.every((line) => line.length <= 40));
  assert.match(headless.join('\n'), /Ctrl\+B then n \/ p/);
  assert.match(headless.join('\n'), /portal-restart/);
  const gui = helpLines(helpSections('gui', DEFAULT_CONFIG), 160).join('\n');
  assert.match(gui, /Ctrl\+Shift\+P/);
  assert.match(gui, /Command mode R/);
  assert.match(gui, /Change modern layout live/);
});
