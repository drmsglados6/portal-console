const MOUSE_RESET = '\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l\x1b[?1016l';

function filterMouseMotion(data, bufferType, mode) {
  if (bufferType !== 'normal' || mode === 'application') return data;
  const sgr = /^\x1b\[<(\d+);\d+;\d+[Mm]$/.exec(data);
  const urxvt = /^\x1b\[(\d+);\d+;\d+M$/.exec(data);
  const legacy = /^\x1b\[M([\s\S]{3})$/u.exec(data);
  if (!sgr && !urxvt && !legacy) return data;
  const button = sgr ? Number(sgr[1]) : urxvt ? Number(urxvt[1]) - 32 : legacy[1].codePointAt(0) - 32;
  // SGR 35 (+ Shift/Ctrl modifiers) is motion without a pressed button.
  // Alt remains the explicit opt-in to application mouse handling.
  if ((button & 32) && (button & 3) === 3 && !(button & 8)) return '';
  return data;
}

function shellMouseSelectionHandler(terminal, getMode) {
  const forwarded = new WeakSet();
  return (event) => {
    if (forwarded.has(event) || event.altKey || getMode() === 'application' || terminal.buffer.active.type !== 'normal') return;
    if (!terminal.element.classList.contains('enable-mouse-events')) return;
    // Mouse tracking disables xterm's selection service as well as reporting
    // packets. Filtering onData cannot restore drag selection. Use xterm's
    // supported force-selection gesture without changing the requested modes.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button !== 0) return;
    const view = terminal.element.ownerDocument.defaultView;
    const mac = /Mac/.test(view.navigator.platform);
    const selection = new view.MouseEvent('mousedown', {
      bubbles: true, cancelable: true, composed: true, view,
      button: event.button, buttons: event.buttons, detail: event.detail,
      clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey,
      shiftKey: mac ? event.shiftKey : true, altKey: mac
    });
    forwarded.add(selection);
    const option = terminal.options.macOptionClickForcesSelection;
    try {
      if (mac) terminal.options.macOptionClickForcesSelection = true;
      (event.target || terminal.element).dispatchEvent(selection);
    } finally {
      if (mac) terminal.options.macOptionClickForcesSelection = option;
    }
  };
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

module.exports = { filterMouseMotion, resetMouseTracking, resetAfterAlternateScreen, shellMouseMotionHandler, shellMouseSelectionHandler };
