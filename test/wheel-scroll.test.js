const test = require('node:test');
const assert = require('node:assert/strict');
const { wheelScrollHandler } = require('../src/wheel-scroll');
const { DEFAULT_CONFIG, validate } = require('../src/config');

function wheel(deltaY, deltaMode = 0, altKey = false) {
  return {
    deltaY, deltaMode, altKey, cancelled: false,
    preventDefault() { this.cancelled = true; },
    stopImmediatePropagation() { this.stopped = true; }
  };
}

test('local wheel scrolls the normal buffer without sending mouse input', () => {
  const scrolled = [];
  const terminal = { rows: 20, buffer: { active: { type: 'normal' } }, scrollLines: (lines) => scrolled.push(lines) };
  const handle = wheelScrollHandler(terminal, () => 15, () => 'local');
  const event = wheel(-120);
  handle(event);
  assert.equal(event.cancelled, true);
  assert.equal(event.stopped, true);
  assert.ok(scrolled[0] < 0);
  terminal.buffer.active.type = 'alternate';
  handle(wheel(120));
  assert.equal(scrolled.length, 1);
});

test('Alt+wheel and application mode defer to xterm mouse handling', () => {
  let mode = 'local';
  const terminal = { rows: 20, buffer: { active: { type: 'normal' } }, scrollLines: () => assert.fail('wheel should not scroll locally') };
  const handle = wheelScrollHandler(terminal, () => 15, () => mode);
  const withAlt = wheel(120, 0, true);
  handle(withAlt);
  assert.equal(withAlt.cancelled, false);
  mode = 'application';
  const application = wheel(120);
  handle(application);
  assert.equal(application.cancelled, false);
  assert.throws(() => validate({ ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, mouseWheelMode: 'unknown' } }), /mouseWheelMode/);
});
