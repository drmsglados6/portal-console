// Track only direct input on the current line; leave all other input to the shell.
function portalCommandInput() {
  let line = '';
  let escaped = false;
  let escapeSequence = '';
  const input = (data) => {
    for (const character of data) {
      if (escapeSequence) {
        escapeSequence += character;
        if (escapeSequence.startsWith('\x1b]') || escapeSequence.startsWith('\x1bP')) {
          if (character === '\x07' || escapeSequence.endsWith('\x1b\\') || escapeSequence.length > 1024) escapeSequence = '';
          continue;
        }
        if (character === '\r' || character === '\n') {
          escapeSequence = '';
          line = '';
          escaped = false;
          continue;
        }
        if (escapeSequence === '\x1b[') continue;
        if (escapeSequence.startsWith('\x1b[') && !/[@-~]/.test(character)) continue;
        // Terminal focus and device replies are not edits to the shell command line.
        if (/^\x1b\[(?:[\d;]*[ABCDHF~])$/.test(escapeSequence)) escaped = true;
        escapeSequence = '';
        continue;
      }
      if (character === '\r' || character === '\n') {
        const command = !escaped && (line === 'portal-exit' ? { type: 'exit' }
          : line === 'portal-help' ? { type: 'help' }
          : line === 'portal-restart' ? { type: 'restart' }
          : /^portal-preset\s+(\S+)$/.test(line) ? { type: 'preset', name: line.match(/^portal-preset\s+(\S+)$/)[1] } : null);
        line = '';
        escaped = false;
        if (command) return command;
      } else if (character === '\x1b') {
        escapeSequence = '\x1b';
      } else if (character === '\x7f' || character === '\b') {
        line = line.slice(0, -1);
      } else if (character === '\x15' || character === '\x03') {
        line = '';
        escaped = false;
      } else if (character < ' ') {
        if (line) escaped = true;
      } else if (!escaped || !line) {
        // A terminal reply or focus change before typing must not disable the next command.
        if (escaped) escaped = false;
        line = line.length < 256 ? line + character : '';
      }
    }
    return null;
  };
  input.reset = () => { line = ''; escaped = false; escapeSequence = ''; };
  return input;
}

function portalExitInput() {
  const input = portalCommandInput();
  return (data) => input(data)?.type === 'exit';
}

module.exports = { portalCommandInput, portalExitInput };
