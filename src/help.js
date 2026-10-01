function helpSections(frontend, config) {
  const gui = frontend === 'gui';
  return [
    { title: 'INTERNAL COMMANDS (at a shell prompt)', entries: [
      ['portal-help', gui ? 'Open this help; Esc or Close returns to the same terminal.' : 'Open paged help; Q/Esc/Enter returns to the same terminal.'],
      ['portal-restart', 'Restart the current pane shell. Its running programs stop; other panes continue.'],
      ['portal-exit', 'Quit the entire application and stop all of its terminal sessions.'],
      ['portal-preset NAME', gui ? 'Change modern layout live. Existing panes are retained; select panes to close when reducing their number.' : 'Live layout changes are GUI-only. Choose the layout at startup with --preset NAME.']
    ] },
    { title: 'PANE SELECTION', entries: gui ? [
      ['Click a terminal', 'Focus that pane.'],
      ['Ctrl+1 / Ctrl+2', 'Select primary / auxiliary terminal if present.'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous visible terminal, wrapping around.']
    ] : [
      ['Ctrl+B then n / p', 'Next / previous terminal, wrapping around. Uppercase N/P also work.'],
      ['Ctrl+B then 1..9', 'Select the numbered terminal; logos and media placeholders are skipped.'],
      ['Ctrl+B then Ctrl+B', 'Send a literal Ctrl+B to the active program.']
    ] },
    { title: 'RESTART AND COMMAND MODE', entries: gui ? [
      ['Ctrl+Shift+P', 'Toggle command mode; command keys are kept out of the shell.'],
      ['Command mode R', 'Restart only the focused pane shell, reset its screen, and reload Windows environment variables.'],
      ['Command mode H/K or J/L', 'Select previous or next terminal.'],
      ['Command mode 1 / 2', 'Select primary / auxiliary if present.'],
      ['Command mode G', 'Toggle static CRT effects.'],
      ['Esc / I', 'Leave command mode and return to the terminal.'],
      ['F1 / Ctrl+Shift+H', 'Open help without interrupting the foreground program.']
    ] : [
      ['Ctrl+B then r', 'Restart only the selected pane. Esc returns from its restart status to terminal input.'],
      ['Ctrl+B then c', 'Enter command mode.'],
      ['Command mode R', 'Restart the selected shell; running programs stop and its profile working directory is restored.'],
      ['Command mode H/K or J/L', 'Select previous or next terminal.'],
      ['Command mode ?', 'Open help.'],
      ['Esc / I', 'Leave command mode and return to terminal input.'],
      ['Ctrl+B then ? or h', 'Open help without interrupting the foreground program.'],
      ['Ctrl+B then q', 'Quit the whole application (also works in help).']
    ] },
    { title: 'LAYOUT AND STARTUP', entries: [
      ['--mode original', 'Retro-style fixed layout: primary terminal, auxiliary terminal and ASCII logo.'],
      ['--mode modern', 'Configured layout; default is three terminals without a logo. A kind: logo pane can be added.'],
      ['--preset NAME', 'Select a layout at startup; --preset-list lists built-in and saved layouts.'],
      ['Preset names', 'NxM grid; N-M / N+M pane counts; leading - reverses placement; c1-2-1 / r1-2-1 specify tracks.'],
      ['--config FILE', 'Use the specified JSON config instead of the user config.'],
      ...gui ? [
        ['F2 / Ctrl+Shift+2', 'Switch to original layout; F3 / Ctrl+Shift+3 switches to modern.'],
        ['Ctrl+Shift+N / Mac Cmd+N', 'Open an independent application window; the + WINDOW button does the same.'],
        ['F11', 'Toggle fullscreen.'],
        ['Close-window selection', config.controls.closeSelectionSyntax === 'regex' ? 'Full-match regex on visible pane numbers, e.g. 1|3|5.' : '2,5 / 2-4 / !3 / !(2-4). The selected count must match the panes to close.']
      ] : [
        ['--headless', 'Force ANSI mode. Linux packages also choose it automatically without DISPLAY/WAYLAND_DISPLAY.'],
        ['Mode/layout changes', 'Currently require exiting and launching again; existing PTYs are stopped.'],
        ['SSH', 'Use an interactive TTY (ssh -t); do not pipe or redirect standard input/output.']
      ]
    ] },
    { title: gui ? 'CLIPBOARD, DISPLAY AND MEDIA' : 'TEXT BROWSERS AND LIMITATIONS', entries: gui ? [
      ['Ctrl+Shift+C / Mac Cmd+C', 'Copy the current selection. Ctrl+C also copies when a selection exists; otherwise it interrupts the running program.'],
      ['Ctrl+V / Mac Cmd+V / Shift+Insert', 'Paste into the focused terminal. Ctrl+Insert copies; right-click copies a selection or pastes.'],
      ['Ctrl++ / Ctrl+- / Ctrl+0', 'Increase / decrease / reset terminal font size (including numpad keys).'],
      ['Mouse wheel / Alt+wheel', 'Scroll local shell history; alternate-screen apps receive wheel events. Alt+wheel always defers to the app.'],
      ['CRT button', 'Adjust glow, scanlines, vignette and glass. Changes are window-local; appearance.crt stores startup defaults.'],
      ['kind: image / pdf / web', 'Display an image, PDF or web page via a configured source path/URL.'],
      ['Pane appearance / startupCommand', 'Set per-pane font/colors and a command for newly created or manually restarted panes.'],
      ['w3m URL', 'A text browser can run inside a terminal too. Ubuntu: sudo apt install w3m; macOS: brew install w3m; MSYS2: pacman -S w3m. For SSH, install on the destination host.']
    ] : [
      ['w3m https://example.com', 'Recommended text browser inside any terminal. deb packages recommend installing w3m.'],
      ['Linux / macOS install', 'Ubuntu: sudo apt install w3m. macOS with Homebrew: brew install w3m. AppImage does not bundle w3m.'],
      ['Windows / SSH', 'Windows has no built-in w3m. MSYS2: pacman -S w3m; Cygwin and WSL are alternatives. For SSH, install it on the destination host.'],
      ['Browser keys', 'For w3m: Tab selects links, Enter opens, B goes back, q quits the browser. Ctrl+B n/p still selects panes.'],
      ['Media / clipboard / font', 'Images, PDF and web panes are placeholders; host-terminal clipboard and font settings are used.'],
      ['Mouse / CRT / sound', 'Mouse forwarding, graphical CRT effects and ending audio are not available in ANSI mode.']
    ] },
    { title: 'ENDING PLAYBACK', entries: [
      [gui ? 'Command mode E' : 'Ctrl+B then c, E', 'Start ending playback; headless playback requires original mode.'],
      ['Space', 'Pause / resume playback.'],
      ['H / L or Left / Right', 'Seek backward / forward by the configured ending.seekStepMs.'],
      ['0', 'Return to the start.'],
      ['Q / Esc', 'Stop playback and return to command mode.'],
      ...gui ? [['Up / Down', 'Change volume by 0.10; hold Ctrl for 0.05 or Shift for 0.01.']] : [],
      ['Portal data', 'Loaded from a local Steam installation; original lyrics/audio are not bundled.']
    ] },
    { title: 'EXIT AND HELP NAVIGATION', entries: gui ? [
      ['Close window / Alt+F4', 'Close the application window and its terminal sessions.'],
      ['Ctrl+Alt+Shift+Q', 'Emergency app exit handled by the main process.'],
      ['Help', 'Scroll this dialog; Esc or Close returns without restarting panes.']
    ] : [
      ['Help Up/Down or K/J', 'Scroll one line. PageUp/PageDown or B/F/Space scroll a page; G goes to the end, g to the start.'],
      ['Help Q / Esc / Enter', 'Close help and return to the prior mode without restarting panes.'],
      ['Ctrl+C', 'Passed to the foreground pane program. Ctrl+B q or portal-exit quits Portal Console.']
    ] }
  ];
}

function helpLines(sections, width) {
  const lines = [];
  const wrap = (text) => {
    while (text.length > width) {
      const space = text.lastIndexOf(' ', width);
      const end = space > 0 ? space : width;
      lines.push(text.slice(0, end));
      text = text.slice(end).trimStart();
    }
    lines.push(text);
  };
  for (const section of sections) {
    wrap(section.title);
    for (const [key, text] of section.entries) { wrap(`  ${key}`); wrap(`    ${text}`); }
    lines.push('');
  }
  return lines;
}

module.exports = { helpSections, helpLines };
