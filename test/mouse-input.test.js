const test = require('node:test');
const assert = require('node:assert/strict');
const { filterMouseMotion, shellMouseMotionHandler, shellMouseSelectionHandler } = require('../src/mouse-input');

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

test('legacy and urxvt idle mouse reports follow the same local/Alt policy', () => {
  const legacy = (button) => `\x1b[M${String.fromCharCode(button + 32)}!!`;
  for (const motion of [legacy(35), '\x1b[67;10;20M']) {
    assert.equal(filterMouseMotion(motion, 'normal', 'local'), '');
    assert.equal(filterMouseMotion(motion, 'alternate', 'local'), motion);
  }
  for (const report of [legacy(43), legacy(0), '\x1b[75;10;20M']) assert.equal(filterMouseMotion(report, 'normal', 'local'), report);
});

test('normal-screen tracking uses native local selection on Windows and Mac without changing mouse modes', () => {
  for (const platform of ['Win32', 'MacIntel']) {
    const mac = platform === 'MacIntel';
    const view = { navigator: { platform }, MouseEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } } };
    const terminal = { buffer: { active: { type: 'normal' } }, options: { macOptionClickForcesSelection: false },
      element: { classList: { contains: () => true }, ownerDocument: { defaultView: view } } };
    let mode = 'local', stopped = 0;
    const forwarded = [];
    const handler = shellMouseSelectionHandler(terminal, () => mode);
    const target = { dispatchEvent: (event) => {
      handler(event); // Synthetic events pass through exactly once.
      forwarded.push(event);
      assert.equal(terminal.options.macOptionClickForcesSelection, mac);
    } };
    const event = { target, button: 0, buttons: 1, detail: 2, clientX: 80, clientY: 60,
      preventDefault() {}, stopImmediatePropagation() { stopped++; } };
    handler(event);
    assert.equal(stopped, 1);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].shiftKey, mac ? undefined : true);
    assert.equal(forwarded[0].altKey, mac);
    assert.equal(forwarded[0].detail, 2);
    assert.equal(forwarded[0].clientX, 80);
    assert.equal(terminal.options.macOptionClickForcesSelection, false);
    handler({ ...event, altKey: true });
    mode = 'application'; handler(event);
    mode = 'local'; terminal.buffer.active.type = 'alternate'; handler(event);
    assert.equal(stopped, 1);
  }
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
