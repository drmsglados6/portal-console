const MOUSE_RESET = '\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?1016l';

function filterMouseMotion(data, bufferType, mode) {
  if (bufferType !== 'normal' || mode === 'application') return data;
  const packet = /^\x1b\[<(\d+);\d+;\d+[Mm]$/.exec(data);
  if (!packet) return data;
  const button = Number(packet[1]);
  // SGR 35 (+ Shift/Ctrl modifiers) is motion without a pressed button.
  // Alt remains the explicit opt-in to application mouse handling.
  if ((button & 32) && (button & 3) === 3 && !(button & 8)) return '';
  return data;
}

function resetMouseTracking(terminal) {
  terminal.write(MOUSE_RESET);
}

function shellMouseMotionHandler(terminal, getMode) {
  return (event) => {
    if (event.buttons || event.altKey || getMode() === 'application' || terminal.buffer.active.type !== 'normal') return;
    if (!terminal.element.classList.contains('enable-mouse-events')) return;
    // CoreMouseService scrolls to bottom before onData is emitted. Capture the
    // idle motion before xterm sees it, otherwise a filtered report still jumps.
    event.stopImmediatePropagation();
  };
}

function resetAfterAlternateScreen(terminal, getMode) {
  let previous = terminal.buffer.active.type;
  return terminal.buffer.onBufferChange((buffer) => {
    const returned = previous === 'alternate' && buffer.type === 'normal';
    previous = buffer.type;
    if (!returned || getMode() === 'application') return;
    // Queue after the current VT write. If another application entered its
    // alternate screen in the same chunk, leave its requested modes intact.
    queueMicrotask(() => {
      if (terminal.buffer.active.type === 'normal' && getMode() !== 'application') resetMouseTracking(terminal);
    });
  });
}

module.exports = { filterMouseMotion, resetMouseTracking, resetAfterAlternateScreen, shellMouseMotionHandler };
