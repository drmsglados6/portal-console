const test = require('node:test');
const assert = require('node:assert/strict');
const { newWindowArgs } = require('../src/window-launch');

test('a packaged new window inherits explicit startup settings', () => {
  assert.deepEqual(newWindowArgs([
    '--config', '/tmp/console.json', '--preset=c1-2-1', '--windowed', '--remote-debugging-port=9222'
  ], true, '/unused'), [
    '--config', '/tmp/console.json', '--preset', 'c1-2-1', '--windowed'
  ]);
});

test('a development new window specifies the project before CLI options', () => {
  assert.deepEqual(newWindowArgs([
    '/path/to/project', '--mode=modern', '--fullscreen'
  ], false, '/path/to/project'), [
    '/path/to/project', '--mode', 'modern', '--fullscreen'
  ]);
});
