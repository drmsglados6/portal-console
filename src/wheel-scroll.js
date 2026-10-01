function wheelScrollHandler(terminal, getFontSize, getMode) {
  let remainder = 0;
  return (event) => {
    if (event.altKey || getMode() === 'application') return;
    if (terminal.buffer.active.type !== 'normal') {
      remainder = 0;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const scale = event.deltaMode === 2 ? terminal.rows
      : event.deltaMode === 1 ? 1
        : 1 / Math.max(12, getFontSize() * 1.08 * 3);
    const amount = remainder + event.deltaY * scale;
    const lines = Math.trunc(amount);
    remainder = amount - lines;
    if (lines) terminal.scrollLines(Math.max(-terminal.rows, Math.min(terminal.rows, lines)));
  };
}

module.exports = { wheelScrollHandler };
