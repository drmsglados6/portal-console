const test = require('node:test');
const assert = require('node:assert/strict');
const { filterMouseMotion, shellMouseMotionHandler } = require('../src/mouse-input');

test('normal shell input suppresses idle SGR motion but keeps clicks, drag and keys', () => {
  for (const code of [35, 39, 51, 55]) assert.equal(filterMouseMotion(`\x1b[<${code};48;46M`, 'normal', 'local'), '');
  for (const data of ['\x1b[<0;10;20M', '\x1b[<0;10;20m', '\x1b[<32;10;20M', '\x1b[A', 'typed input']) {
    assert.equal(filterMouseMotion(data, 'normal', 'local'), data);
  }
});

test('alternate-screen, application mode and Alt motion keep native reports', () => {
  const motion = '\x1b[<35;48;46M';
  assert.equal(filterMouseMotion(motion, 'alternate', 'local'), motion);
  assert.equal(filterMouseMotion(motion, 'normal', 'application'), motion);
  const alt = '\x1b[<43;48;46M';
  assert.equal(filterMouseMotion(alt, 'normal', 'local'), alt);
});

test('idle motion is intercepted before xterm can scroll history to the bottom', () => {
  const terminal = { buffer: { active: { type: 'normal' } }, element: { classList: { contains: () => true } } };
  const handler = shellMouseMotionHandler(terminal, () => 'local');
  let stopped = 0;
  const event = { buttons: 0, altKey: false, stopImmediatePropagation: () => stopped++ };
  handler(event);
  assert.equal(stopped, 1);
  handler({ ...event, buttons: 1 });
  handler({ ...event, altKey: true });
  terminal.buffer.active.type = 'alternate';
  handler(event);
  assert.equal(stopped, 1);
});
