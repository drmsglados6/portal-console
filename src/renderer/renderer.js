const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { prepareScene, sceneState } = require('../ending-state');
const { portalCommandInput } = require('../portal-command');
const { remapPreset } = require('../preset-switch');
const { selectWindowNumbers } = require('../window-selection');
const { wheelScrollHandler } = require('../wheel-scroll');

const screen = document.querySelector('#screen');
const modeIndicator = document.querySelector('#mode-indicator');
const endingOverlay = document.querySelector('#ending-overlay');
const endingLeftText = document.querySelector('#ending-left-text');
const endingCreditText = document.querySelector('#ending-credit-text');
const endingArtText = document.querySelector('#ending-art-text');
const panes = new Map();
const logos = new Map();
const media = new Map();
const presetDialog = document.querySelector('#preset-dialog');
const helpDialog = document.querySelector('#help-dialog');
const replaceDialog = document.querySelector('#replace-dialog');
const terminalTheme = {
  background: '#050301', foreground: '#ff9d20', cursor: '#ffc168', cursorAccent: '#050301',
  selectionBackground: '#7a430e99', black: '#050301', red: '#ff7920', green: '#d88319', yellow: '#ffc168',
  blue: '#c86c16', magenta: '#ef8120', cyan: '#e88a1d', white: '#ffd49a', brightBlack: '#78430e',
  brightRed: '#ff9d20', brightGreen: '#ffad39', brightYellow: '#ffd08a', brightBlue: '#ff9d20',
  brightMagenta: '#ffb04a', brightCyan: '#ffbd63', brightWhite: '#fff0d5'
};
let config;
let mode;
let fullscreen;
let focusedId;
let fontSize = 15;
let commandMode = false;
let endingScene;
let endingLogoArt = '';
let endingPlayback;
let endingAudio;
let endingAudioStarting = false;
let endingAudioFailed = false;
let endingAudioClockActive = false;
let endingAudioContext;
let endingCompressor;
let endingBassFilter;
let endingVolume = 0.1;
let endingArtFitKey = '';
let switchingPreset = false;
let queuedPreset;

async function openNewWindow() {
  try { await window.portalConsole.newWindow(); }
  catch (error) { showStatus(`NEW WINDOW ERROR: ${error.message}`); }
}
let statusTimer;

function showStatus(message) {
  if (commandMode || endingPlayback) return;
  clearTimeout(statusTimer);
  modeIndicator.textContent = message;
  document.body.classList.add('status-mode');
  statusTimer = setTimeout(() => {
    document.body.classList.remove('status-mode');
    modeIndicator.textContent = '';
  }, 6000);
}

function showHelp(sourceId) {
  if (helpDialog.open) return;
  window.portalConsole.write(sourceId, '\x03');
  document.querySelector('#help-selection').textContent = config.controls.closeSelectionSyntax === 'regex'
    ? 'Close-window selection: full-match regular expression against window numbers.'
    : 'Close-window selection: 2,5 / 2-4 / !3 / !(2-4).';
  const presetList = document.querySelector('#help-presets');
  presetList.textContent = 'Available presets: loading...';
  window.portalConsole.presets().then((names) => {
    if (helpDialog.open) presetList.textContent = `Available presets: ${names.join(', ')}`;
  }).catch((error) => { presetList.textContent = `Presets unavailable: ${error.message}`; });
  const close = () => helpDialog.close();
  const restore = () => {
    document.querySelector('#help-close').removeEventListener('click', close);
    panes.get(sourceId)?.commandInput.reset();
    if (panes.get(sourceId)?.element.isConnected) focusPane(sourceId);
  };
  document.querySelector('#help-close').addEventListener('click', close);
  helpDialog.addEventListener('close', restore, { once: true });
  helpDialog.showModal();
  document.querySelector('#help-close').focus();
}

function chooseWindowsToClose(specs, count) {
  return new Promise((resolve) => {
    const form = document.querySelector('#preset-form');
    const selection = document.querySelector('#preset-selection');
    const error = document.querySelector('#preset-error');
    const preview = document.querySelector('#preset-preview');
    document.querySelector('#preset-options').textContent = `Close ${count} of ${specs.length}: ${specs.map((spec, index) => `${index + 1} (${spec.title})`).join(', ')}`;
    selection.value = '';
    error.textContent = '';
    preview.textContent = '';
    const updatePreview = () => {
      try { preview.textContent = `Selected: ${selectWindowNumbers(selection.value, specs.length, config.controls.closeSelectionSyntax).join(', ')}`; }
      catch { preview.textContent = ''; }
    };
    const finish = (value) => {
      form.removeEventListener('submit', submit);
      presetDialog.removeEventListener('cancel', cancel);
      document.querySelector('#preset-cancel').removeEventListener('click', cancel);
      selection.removeEventListener('input', updatePreview);
      presetDialog.close();
      resolve(value);
    };
    const cancel = (event) => { event.preventDefault(); finish(null); };
    const submit = (event) => {
      event.preventDefault();
      try {
        const numbers = selectWindowNumbers(selection.value, specs.length, config.controls.closeSelectionSyntax);
        if (numbers.length !== count) throw new Error(`Select exactly ${count} windows; selected: ${numbers.join(', ') || 'none'}`);
        finish(numbers);
      } catch (cause) {
        error.textContent = cause.message;
      }
    };
    form.addEventListener('submit', submit);
    selection.addEventListener('input', updatePreview);
    presetDialog.addEventListener('cancel', cancel);
    document.querySelector('#preset-cancel').addEventListener('click', cancel);
    presetDialog.showModal();
    selection.focus();
  });
}

function confirmReplacement(specs, ids) {
  if (!ids.length) return Promise.resolve(true);
  document.querySelector('#replace-message').textContent = `The following windows will close and change type: ${ids.map((id) => `${specs.findIndex((pane) => pane.id === id) + 1} (${id})`).join(', ')}`;
  return new Promise((resolve) => {
    const accept = () => finish(true);
    const decline = () => finish(false);
    const cancel = (event) => { event.preventDefault(); finish(false); };
    const finish = (accepted) => {
      document.querySelector('#replace-confirm').removeEventListener('click', accept);
      document.querySelector('#replace-cancel').removeEventListener('click', decline);
      replaceDialog.removeEventListener('cancel', cancel);
      replaceDialog.close();
      resolve(accepted);
    };
    document.querySelector('#replace-confirm').addEventListener('click', accept);
    document.querySelector('#replace-cancel').addEventListener('click', decline);
    replaceDialog.addEventListener('cancel', cancel);
    replaceDialog.showModal();
  });
}

async function switchPreset(name, sourceId) {
  if (endingPlayback) return;
  if (switchingPreset) {
    queuedPreset = { name, sourceId };
    return;
  }
  switchingPreset = true;
  // Enter was intercepted; cancel the command still held by the underlying shell.
  window.portalConsole.write(sourceId, '\x03');
  try {
    const target = await window.portalConsole.preset(name);
    const oldSpecs = config.modern.panes;
    const excess = Math.max(0, oldSpecs.length - target.panes.length);
    const closed = excess ? await chooseWindowsToClose(oldSpecs, excess) : [];
    if (closed === null) return;
    const { layout, closedIds, replacedIds } = remapPreset(config.modern, target, closed, [...panes.keys(), ...media.keys()]);
    if (!await confirmReplacement(oldSpecs, replacedIds)) return;
    await window.portalConsole.setLayout(layout);
    for (const id of closedIds) {
      const pane = panes.get(id);
      if (pane) {
        pane.observer.disconnect();
        pane.wheelTarget.removeEventListener('wheel', pane.wheelListener, true);
        clearTimeout(pane.startupTimer);
        pane.terminal.dispose();
        pane.element.remove();
        panes.delete(id);
      }
      if (pane) await window.portalConsole.close(id);
      const view = media.get(id);
      view?.element.remove();
      media.delete(id);
      const logo = logos.get(id);
      logo?.observer.disconnect();
      logo?.element.remove();
      logos.delete(id);
    }
    config.modern = layout;
    for (const spec of layout.panes) {
      const pane = panes.get(spec.id);
      if (pane) {
        pane.spec = spec;
        pane.element.querySelector('.pane-title').textContent = spec.title;
        applyPaneAppearance(pane);
      } else if (spec.kind === 'terminal') await terminalElement(spec);
    }
    await renderLayout('modern');
  } catch (error) {
    showStatus(`PRESET ERROR: ${error.message}`);
  } finally {
    if (panes.get(sourceId)?.element.isConnected) focusPane(sourceId);
    switchingPreset = false;
    if (queuedPreset) {
      const next = queuedPreset;
      queuedPreset = null;
      queueMicrotask(() => { if (panes.has(next.sourceId)) switchPreset(next.name, next.sourceId); });
    }
  }
}

function logoElement(id, title) {
  if (logos.has(id)) return logos.get(id).element;
  const pane = document.createElement('section');
  pane.className = 'pane logo-pane';
  pane.dataset.pane = id;
  const heading = document.createElement('div');
  heading.className = 'pane-title';
  heading.textContent = title;
  const art = document.createElement('pre');
  art.className = 'ascii-logo';
  art.textContent = 'GENERATING APERTURE SCIENCE IDENTIFICATION...';
  pane.append(heading, art);
  let generation = 0;
  let lastSize = '';
  let updateTimer;
  const update = async () => {
    if (!pane.isConnected || pane.clientWidth < 20 || pane.clientHeight < 20) return;
    const current = ++generation;
    const logoFontSize = Math.max(7, fontSize - 4);
    art.style.fontSize = `${logoFontSize}px`;
    const columns = Math.max(8, Math.floor((pane.clientWidth - 20) / (logoFontSize * 0.62)));
    const rows = Math.max(4, Math.floor((pane.clientHeight - 28) / logoFontSize));
    const size = `${columns}x${rows}@${logoFontSize}`;
    if (size === lastSize) return;
    lastSize = size;
    try {
      const value = await window.portalConsole.logoArt(columns, rows);
      if (current === generation) art.textContent = value;
    } catch (error) {
      art.textContent = `LOGO CONVERSION FAILURE\n${error.message}`;
    }
  };
  const scheduleUpdate = () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(update, 120);
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(pane);
  logos.set(id, { element: pane, observer, update: scheduleUpdate });
  return pane;
}

async function mediaElement(spec) {
  const existing = media.get(spec.id);
  if (existing?.spec.kind === spec.kind && existing.spec.source === spec.source) return existing.element;
  existing?.element.remove();
  const pane = document.createElement('section');
  pane.className = 'pane media-pane';
  pane.dataset.pane = spec.id;
  const heading = document.createElement('div');
  heading.className = 'pane-title';
  heading.textContent = spec.title || spec.id;
  pane.append(heading);
  const host = document.createElement('div');
  host.className = 'media-host';
  pane.append(host);
  media.set(spec.id, { spec, element: pane });
  try {
    const url = await window.portalConsole.mediaUrl(spec.id);
    if (spec.kind === 'image') {
      const image = document.createElement('img');
      image.alt = spec.title || spec.id;
      image.src = url;
      host.append(image);
    } else {
      const view = document.createElement('webview');
      view.setAttribute('webpreferences', 'sandbox=yes,nodeIntegration=no,contextIsolation=yes');
      view.src = url;
      if (spec.kind === 'web') {
        const toolbar = document.createElement('div');
        toolbar.className = 'media-toolbar';
        const address = document.createElement('input');
        address.value = url;
        address.setAttribute('aria-label', 'Web address');
        const back = document.createElement('button');
        back.textContent = '←';
        back.addEventListener('click', () => { if (view.canGoBack()) view.goBack(); });
        const forward = document.createElement('button');
        forward.textContent = '→';
        forward.addEventListener('click', () => { if (view.canGoForward()) view.goForward(); });
        const reload = document.createElement('button');
        reload.textContent = '↻';
        reload.addEventListener('click', () => view.reload());
        address.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.stopPropagation();
          try {
            const destination = new URL(address.value);
            if (!['http:', 'https:'].includes(destination.protocol)) throw new Error('Only http(s) URLs are supported');
            view.loadURL(destination.href);
          } catch { address.setCustomValidity('Enter a valid http(s) URL'); address.reportValidity(); }
        });
        address.addEventListener('input', () => address.setCustomValidity(''));
        view.addEventListener('did-navigate', (event) => { address.value = event.url; });
        toolbar.append(back, forward, reload, address);
        pane.prepend(toolbar);
      }
      view.addEventListener('did-fail-load', (event) => {
        if (event.errorCode === -3) return;
        heading.textContent = `${spec.title || spec.id} — LOAD FAILED`;
      });
      host.append(view);
    }
  } catch (error) {
    host.textContent = `COULD NOT OPEN ${spec.kind.toUpperCase()}: ${error.message}`;
  }
  return pane;
}

function paneFontSize(spec) {
  return Math.max(6, Math.min(72, (spec.appearance?.fontSize ?? config.appearance.fontSize) + fontSize - config.appearance.fontSize));
}

function paneTheme(spec) {
  return { ...terminalTheme,
    ...(spec.appearance?.foreground ? { foreground: spec.appearance.foreground } : {}),
    ...(spec.appearance?.background ? { background: spec.appearance.background } : {}) };
}

function applyPaneAppearance(pane) {
  pane.terminal.options.fontSize = paneFontSize(pane.spec);
  pane.terminal.options.theme = paneTheme(pane.spec);
}

function scheduleStartup(pane, delay) {
  if (!pane.pendingStartup || pane.startupTimer) return;
  pane.startupTimer = setTimeout(() => {
    pane.startupTimer = null;
    const command = pane.pendingStartup;
    pane.pendingStartup = null;
    if (command && panes.get(pane.spec.id) === pane) window.portalConsole.write(pane.spec.id, `${command}\r`);
  }, delay);
}

async function terminalElement(spec) {
  const pane = document.createElement('section');
  pane.className = 'pane terminal-pane';
  pane.dataset.pane = spec.id;
  pane.innerHTML = `<div class="pane-title"></div><div class="terminal-host"></div>`;
  pane.querySelector('.pane-title').textContent = spec.title;
  const host = pane.querySelector('.terminal-host');
  const commandInput = portalCommandInput();
  const terminal = new Terminal({
    fontFamily: 'Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: paneFontSize(spec),
    lineHeight: 1.08,
    cursorBlink: config.appearance.hardwareAcceleration,
    cursorStyle: 'block',
    scrollback: 5000,
    allowTransparency: true,
    theme: paneTheme(spec)
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(host);
  const wheelTarget = terminal.element;
  const wheelListener = wheelScrollHandler(terminal, () => terminal.options.fontSize, () => config.appearance.mouseWheelMode);
  wheelTarget.addEventListener('wheel', wheelListener, { capture: true, passive: false });
  terminal.onData((data) => {
    const command = commandInput(data);
    if (command?.type === 'exit') window.portalConsole.quit();
    else if (command?.type === 'preset') switchPreset(command.name, spec.id);
    else if (command?.type === 'help') showHelp(spec.id);
    else window.portalConsole.write(spec.id, data);
  });
  pane.addEventListener('pointerdown', () => focusPane(spec.id));
  pane.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    focusPane(spec.id);
    if (terminal.hasSelection()) copySelection();
    else pasteClipboard();
  });
  const observer = new ResizeObserver(() => fitPane(spec.id));
  observer.observe(host);
  const paneState = { spec, element: pane, terminal, fit, observer, commandInput, wheelTarget, wheelListener, generation: 0, pendingStartup: spec.startupCommand || null };
  panes.set(spec.id, paneState);
  const created = await window.portalConsole.create({ id: spec.id, cols: 80, rows: 24 });
  paneState.generation = created.generation;
  scheduleStartup(paneState, 1200);
  requestAnimationFrame(() => fitPane(spec.id));
}

function fitPane(id) {
  const pane = panes.get(id);
  if (!pane || pane.fitScheduled) return;
  pane.fitScheduled = requestAnimationFrame(() => {
    pane.fitScheduled = null;
    if (!pane.element.isConnected || pane.element.clientWidth < 10 || pane.element.clientHeight < 10) return;
    pane.fit.fit();
    if (pane.lastCols === pane.terminal.cols && pane.lastRows === pane.terminal.rows) return;
    pane.lastCols = pane.terminal.cols;
    pane.lastRows = pane.terminal.rows;
    window.portalConsole.resize(id, pane.terminal.cols, pane.terminal.rows);
  });
}

function focusPane(id) {
  const pane = panes.get(id);
  if (!pane) return;
  focusedId = id;
  document.querySelectorAll('.pane').forEach((element) => element.classList.toggle('focused', element.dataset.pane === id));
  pane.terminal.focus();
}

function terminalSpecs() {
  const base = [
    { id: 'main', title: 'PRIMARY TERMINAL', kind: 'terminal' },
    { id: 'aux', title: 'AUXILIARY TERMINAL', kind: 'terminal' }
  ];
  const merged = new Map(base.map((pane) => [pane.id, pane]));
  for (const pane of config.modern.panes) if (pane.kind === 'terminal') merged.set(pane.id, pane);
  return [...merged.values()];
}

async function renderLayout(nextMode) {
  if (nextMode === 'original') {
    for (const id of ['main', 'aux']) {
      if (!panes.has(id)) await terminalElement({ id, title: id === 'main' ? 'PRIMARY TERMINAL' : 'AUXILIARY TERMINAL', kind: 'terminal' });
    }
  }
  if (mode !== nextMode) screen.replaceChildren();
  mode = nextMode;
  document.querySelectorAll('#layout-switch [data-layout]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.layout === mode));
  });
  screen.className = `screen ${mode}`;
  screen.style.removeProperty('grid-template-columns');
  screen.style.removeProperty('grid-template-rows');
  screen.style.removeProperty('grid-template-areas');
  if (mode === 'original') {
    for (const child of [...screen.children]) if (!['main', 'aux', 'logo'].includes(child.dataset.pane)) child.remove();
    const main = panes.get('main').element;
    const aux = panes.get('aux').element;
    main.style.gridArea = 'main';
    aux.style.gridArea = 'aux';
    const logo = logoElement('logo', 'APERTURE SCIENCE');
    logo.style.gridArea = 'logo';
    for (const element of [main, aux, logo]) if (element.parentElement !== screen) screen.append(element);
  } else {
    screen.style.gridTemplateColumns = config.modern.columns.join(' ');
    screen.style.gridTemplateRows = config.modern.rows.join(' ');
    screen.style.gridTemplateAreas = config.modern.areas.map((row) => `"${row}"`).join(' ');
    const visibleIds = new Set(config.modern.panes.map((spec) => spec.id));
    for (const child of [...screen.children]) if (!visibleIds.has(child.dataset.pane)) child.remove();
    let windowNumber = 0;
    for (const spec of config.modern.panes) {
      const element = spec.kind === 'terminal' ? panes.get(spec.id)?.element
        : spec.kind === 'logo' ? logoElement(spec.id, spec.title || spec.id)
          : await mediaElement(spec);
      if (!element) continue;
      windowNumber += 1;
      element.querySelector('.pane-title').textContent = `${windowNumber} · ${spec.title || spec.id}`;
      element.style.gridArea = spec.id;
      if (element.parentElement !== screen) screen.append(element);
    }
    for (const id of media.keys()) if (!visibleIds.has(id)) media.delete(id);
  }
  requestAnimationFrame(() => {
    for (const id of panes.keys()) fitPane(id);
    for (const logo of logos.values()) logo.update();
    focusPane(panes.has(focusedId) && panes.get(focusedId).element.isConnected ? focusedId : [...panes.keys()].find((id) => panes.get(id).element.isConnected));
  });
}

function cycleFocus(reverse = false) {
  const visible = [...panes.keys()].filter((id) => panes.get(id).element.isConnected);
  const current = visible.indexOf(focusedId);
  const offset = reverse ? -1 : 1;
  focusPane(visible[(current + offset + visible.length) % visible.length]);
}

function setFontSize(value) {
  const appearance = config.appearance;
  fontSize = Math.max(appearance.minimumFontSize, Math.min(appearance.maximumFontSize, value));
  for (const pane of panes.values()) pane.terminal.options.fontSize = paneFontSize(pane.spec);
  requestAnimationFrame(() => {
    for (const id of panes.keys()) fitPane(id);
    for (const logo of logos.values()) logo.update();
  });
}

async function copySelection() {
  const pane = panes.get(focusedId);
  const value = pane?.terminal.getSelection();
  if (!value) return;
  await window.portalConsole.writeClipboard(value);
  pane.terminal.clearSelection();
}

async function pasteClipboard() {
  const pane = panes.get(focusedId);
  if (!pane || commandMode) return;
  const value = await window.portalConsole.readClipboard();
  if (value) pane.terminal.paste(value);
}

function setCommandMode(value, message = '') {
  clearTimeout(statusTimer);
  document.body.classList.remove('status-mode');
  commandMode = value;
  document.body.classList.toggle('command-mode', commandMode);
  modeIndicator.textContent = commandMode
    ? `-- COMMAND --  ${message || 'E ENDING   R RESTART   H/L SELECT   ESC/I TERMINAL'}`
    : '';
  if (!commandMode) panes.get(focusedId)?.terminal.focus();
}

function endingTime() {
  if (!endingPlayback) return 0;
  if (endingPlayback.paused) return endingPlayback.baseTime;
  if (endingAudioClockActive && endingAudio && !endingAudio.paused && !endingAudio.ended) {
    return Math.min(endingPlayback.scene.durationMs, endingPlayback.scene.audioStartMs + endingAudio.currentTime * 1000);
  }
  return Math.min(endingPlayback.scene.durationMs, endingPlayback.baseTime + performance.now() - endingPlayback.baseNow);
}

function renderEndingAt(time) {
  const scene = endingPlayback.scene;
  const state = sceneState(scene, time);
  endingLeftText.textContent = state.left;
  const creditFontSize = Math.max(9, fontSize - 3);
  endingCreditText.style.fontSize = `${creditFontSize}px`;
  const creditRows = Math.max(4, Math.floor((endingCreditText.parentElement.clientHeight - 20) / (creditFontSize * 1.08)));
  endingCreditText.textContent = state.credits.split('\n').slice(-creditRows).join('\n');
  const art = state.frame === '$logo' ? endingLogoArt : scene.frames[state.frame] || '';
  endingArtText.textContent = art;
  fitEndingArt(art);
  let audioStatus = 'NO AUDIO';
  if (endingAudio && scene.audioStartMs !== null) {
    if (time < scene.audioStartMs) audioStatus = `AUDIO IN ${((scene.audioStartMs - time) / 1000).toFixed(1)}s`;
    else if (endingAudioFailed) audioStatus = 'AUDIO FAILED';
    else if (endingAudio.ended) audioStatus = 'AUDIO COMPLETE';
    else audioStatus = 'AUDIO ON';
  }
  modeIndicator.textContent = `-- PLAYBACK --  ${Math.floor(time / 1000)} / ${Math.ceil(scene.durationMs / 1000)}s   ${audioStatus}   VOL ${endingVolume.toFixed(2)} GAIN ${effectiveEndingVolume().toFixed(2)}   SPACE PAUSE   H/L SEEK   Q STOP`;
}

function fitEndingArt(art) {
  if (!art) return;
  const lines = art.split('\n');
  const columns = Math.max(...lines.map((line) => line.length), 1);
  const rows = Math.max(lines.length, 1);
  const host = endingArtText.parentElement;
  const key = `${host.clientWidth}x${host.clientHeight}:${columns}x${rows}`;
  if (key === endingArtFitKey) return;
  endingArtFitKey = key;
  const availableWidth = Math.max(1, host.clientWidth - 20);
  const availableHeight = Math.max(1, host.clientHeight - 20);
  const fitted = Math.max(7, Math.min(32, Math.floor(Math.min(availableWidth / (columns * 0.61), availableHeight / rows))));
  endingArtText.style.fontSize = `${fitted}px`;
}

new ResizeObserver(() => {
  endingArtFitKey = '';
  if (endingPlayback) renderEndingAt(endingTime());
}).observe(endingArtText.parentElement);

function syncEndingAudio(time, shouldPlay, seek = false) {
  if (!endingAudio || endingAudioFailed || endingPlayback.scene.audioStartMs === null) return;
  const desired = Math.max(0, (time - endingPlayback.scene.audioStartMs) / 1000);
  if (time < endingPlayback.scene.audioStartMs) {
    endingAudio.pause();
    endingAudioClockActive = false;
    if (endingAudio.currentTime > 0.05) endingAudio.currentTime = 0;
    return;
  }
  if (endingAudio.ended && !seek) return;
  if (seek || (!endingAudioClockActive && endingAudio.paused && !endingAudioStarting)) {
    endingAudio.currentTime = Math.min(desired, endingAudio.duration || desired);
  }
  if (!shouldPlay) {
    endingAudio.pause();
  } else if (endingAudio.paused && !endingAudioStarting && !endingAudio.ended) {
    endingAudioStarting = true;
    Promise.resolve(endingAudioContext?.resume()).then(() => endingAudio.play()).then(() => {
      endingAudioClockActive = true;
      window.portalConsole.diagnostic(`Ending audio started at ${endingAudio.currentTime.toFixed(2)}s, volume=${endingAudio.volume}, muted=${endingAudio.muted}, bass=${config.ending.bassGainDb}dB, compressor=${Boolean(endingCompressor)}`);
    }).catch((error) => {
      endingAudioFailed = true;
      window.portalConsole.diagnostic(`Ending audio failed: ${error.message}`);
      modeIndicator.textContent = `-- PLAYBACK -- AUDIO FAILED: ${error.message}   Q STOP`;
    }).finally(() => { endingAudioStarting = false; });
  }
}

function endingTick() {
  if (!endingPlayback || endingPlayback.paused) return;
  const time = endingTime();
  renderEndingAt(time);
  syncEndingAudio(time, true);
  if (time >= endingPlayback.scene.durationMs) {
    endingPlayback.baseTime = endingPlayback.scene.durationMs;
    endingPlayback.paused = true;
    syncEndingAudio(time, false);
    modeIndicator.textContent = '-- PLAYBACK COMPLETE --  0 RESTART   Q/ESC RETURN';
    return;
  }
  endingPlayback.frame = requestAnimationFrame(endingTick);
}

async function startEndingPlayback() {
  if (mode !== 'original' || endingPlayback) {
    if (mode !== 'original') setCommandMode(true, 'ENDING PLAYBACK REQUIRES ORIGINAL MODE');
    return;
  }
  setCommandMode(true, 'LOADING ENDING SCENE...');
  try {
    if (!endingScene) {
      const loaded = await window.portalConsole.endingScene();
      endingScene = prepareScene(loaded.scene);
      if (loaded.hasAudio) {
        const bytes = await window.portalConsole.endingAudio();
        const audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
        endingAudio = new Audio(audioUrl);
        endingAudio.preload = 'auto';
        endingAudio.volume = effectiveEndingVolume();
        endingAudio.muted = false;
        endingAudioFailed = false;
        if (config.ending.compressor || config.ending.bassGainDb !== 0) {
          endingAudioContext = new AudioContext({ latencyHint: 'playback' });
          const source = endingAudioContext.createMediaElementSource(endingAudio);
          let output = source;
          if (config.ending.bassGainDb !== 0) {
            endingBassFilter = endingAudioContext.createBiquadFilter();
            endingBassFilter.type = 'lowshelf';
            endingBassFilter.frequency.value = 200;
            endingBassFilter.gain.value = config.ending.bassGainDb;
            output.connect(endingBassFilter);
            output = endingBassFilter;
          }
          if (config.ending.compressor) {
            endingCompressor = endingAudioContext.createDynamicsCompressor();
            endingCompressor.threshold.value = -12;
            endingCompressor.knee.value = 12;
            endingCompressor.ratio.value = 3;
            endingCompressor.attack.value = 0.006;
            endingCompressor.release.value = 0.25;
            output.connect(endingCompressor);
            output = endingCompressor;
          }
          output.connect(endingAudioContext.destination);
        }
        endingAudio.addEventListener('error', () => {
          const error = endingAudio.error;
          window.portalConsole.diagnostic(`Ending media error ${error?.code || 'unknown'}: ${error?.message || 'no message'}`);
        });
        endingAudio.addEventListener('ended', () => {
          if (!endingPlayback) return;
          endingPlayback.baseTime = Math.min(endingPlayback.scene.durationMs, endingPlayback.scene.audioStartMs + endingAudio.duration * 1000);
          endingPlayback.baseNow = performance.now();
          endingAudioClockActive = false;
        });
      }
    }
    endingLogoArt ||= await window.portalConsole.logoArt(44, 18);
    commandMode = false;
    document.body.classList.remove('command-mode');
    document.body.classList.add('ending-mode');
    endingOverlay.style.setProperty('--ending-color', endingScene.color);
    endingOverlay.hidden = false;
    endingPlayback = { scene: endingScene, baseTime: 0, baseNow: performance.now(), paused: false, frame: null };
    renderEndingAt(0);
    syncEndingAudio(0, true);
    endingPlayback.frame = requestAnimationFrame(endingTick);
  } catch (error) {
    setCommandMode(true, `PLAYBACK FAILED: ${error.message}`);
  }
}

function pauseEndingPlayback() {
  if (!endingPlayback) return;
  if (endingPlayback.paused) {
    endingPlayback.paused = false;
    endingPlayback.baseNow = performance.now();
    syncEndingAudio(endingPlayback.baseTime, true, true);
    endingPlayback.frame = requestAnimationFrame(endingTick);
  } else {
    endingPlayback.baseTime = endingTime();
    endingPlayback.paused = true;
    cancelAnimationFrame(endingPlayback.frame);
    syncEndingAudio(endingPlayback.baseTime, false);
    renderEndingAt(endingPlayback.baseTime);
    modeIndicator.textContent += '   [PAUSED]';
  }
}

function seekEndingPlayback(offset, absolute = false) {
  if (!endingPlayback) return;
  endingPlayback.baseTime = Math.max(0, Math.min(endingPlayback.scene.durationMs, absolute ? offset : endingTime() + offset));
  endingPlayback.baseNow = performance.now();
  renderEndingAt(endingPlayback.baseTime);
  syncEndingAudio(endingPlayback.baseTime, !endingPlayback.paused, true);
  if (!endingPlayback.paused) {
    cancelAnimationFrame(endingPlayback.frame);
    endingPlayback.frame = requestAnimationFrame(endingTick);
  }
}

function stopEndingPlayback() {
  if (!endingPlayback) return;
  cancelAnimationFrame(endingPlayback.frame);
  endingAudio?.pause();
  endingAudioContext?.suspend();
  endingAudioClockActive = false;
  if (endingAudio) endingAudio.currentTime = 0;
  endingPlayback = null;
  endingOverlay.hidden = true;
  document.body.classList.remove('ending-mode');
  setCommandMode(true, 'E PLAY ENDING   R RESTART   ESC/I TERMINAL');
}

function adjustEndingVolume(delta) {
  endingVolume = Math.max(0, Math.min(1, Math.round((endingVolume + delta) * 100) / 100));
  if (endingAudio) endingAudio.volume = effectiveEndingVolume();
  if (endingPlayback) renderEndingAt(endingTime());
  window.portalConsole.diagnostic(`Ending volume adjusted to ${endingVolume.toFixed(2)}`);
}

function effectiveEndingVolume() {
  return config.ending.volumeCurve === 'quadratic' ? endingVolume * endingVolume : endingVolume;
}

async function restartFocusedTerminal() {
  const pane = panes.get(focusedId);
  if (!pane || pane.restarting) return;
  pane.restarting = true;
  pane.generation += 1;
  pane.commandInput.reset();
  pane.terminal.reset();
  setCommandMode(true, `RESTARTING ${pane.spec.title}...`);
  try {
    const result = await window.portalConsole.restart(focusedId);
    pane.generation = result.generation;
    pane.pendingStartup = pane.spec.startupCommand || null;
    pane.startupSawOutput = false;
    scheduleStartup(pane, 1200);
    setCommandMode(true, `${pane.spec.title} RESTARTED   ESC/I TERMINAL`);
  } catch (error) {
    pane.generation -= 1;
    pane.terminal.write(`\r\n\x1b[31m[restart failed: ${error.message}]\x1b[0m\r\n`);
    setCommandMode(true, 'RESTART FAILED   ESC/I TERMINAL');
  } finally {
    pane.restarting = false;
  }
}

function bindKeys() {
  window.addEventListener('keydown', (event) => {
    if (presetDialog.open || helpDialog.open || replaceDialog.open) return;
    let handled = true;
    if (endingPlayback && event.code === 'Space') pauseEndingPlayback();
    else if (endingPlayback && (event.key === 'Escape' || event.key.toLowerCase() === 'q')) stopEndingPlayback();
    else if (endingPlayback && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const step = event.shiftKey ? 0.01 : event.ctrlKey ? 0.05 : 0.1;
      adjustEndingVolume(event.key === 'ArrowUp' ? step : -step);
    }
    else if (endingPlayback && (event.key.toLowerCase() === 'h' || event.key === 'ArrowLeft')) seekEndingPlayback(-config.ending.seekStepMs);
    else if (endingPlayback && (event.key.toLowerCase() === 'l' || event.key === 'ArrowRight')) seekEndingPlayback(config.ending.seekStepMs);
    else if (endingPlayback && event.key === '0') {
      const wasComplete = endingPlayback.baseTime >= endingPlayback.scene.durationMs;
      seekEndingPlayback(0, true);
      if (wasComplete && endingPlayback.paused) pauseEndingPlayback();
    }
    else if (endingPlayback) { /* Isolate playback controls from live PTYs. */ }
    else if (event.code === 'KeyN' && (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
      || event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey)) openNewWindow();
    else if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'Digit2') renderLayout('original');
    else if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'Digit3') renderLayout('modern');
    else if (event.ctrlKey && event.shiftKey && event.code === 'KeyP') setCommandMode(!commandMode);
    else if (commandMode && (event.key === 'Escape' || event.key.toLowerCase() === 'i')) setCommandMode(false);
    else if (commandMode && event.key.toLowerCase() === 'r') restartFocusedTerminal();
    else if (commandMode && event.key.toLowerCase() === 'e') startEndingPlayback();
    else if (commandMode && ['h', 'k'].includes(event.key.toLowerCase())) cycleFocus(true);
    else if (commandMode && ['j', 'l'].includes(event.key.toLowerCase())) cycleFocus(false);
    else if (commandMode && event.key === '1') focusPane('main');
    else if (commandMode && event.key === '2') focusPane('aux');
    else if (commandMode) { /* Keep command-mode keystrokes out of the PTY. */ }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && (event.shiftKey || event.metaKey || panes.get(focusedId)?.terminal.hasSelection())) copySelection();
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') pasteClipboard();
    else if (event.shiftKey && event.code === 'Insert') pasteClipboard();
    else if (event.ctrlKey && event.code === 'Insert') copySelection();
    else if (event.ctrlKey && event.key === '1') focusPane('main');
    else if (event.ctrlKey && event.key === '2') focusPane('aux');
    else if (event.ctrlKey && event.key === 'Tab') cycleFocus(event.shiftKey);
    else if (event.ctrlKey && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) setFontSize(fontSize + config.appearance.fontSizeStep);
    else if (event.ctrlKey && (event.key === '-' || event.code === 'NumpadSubtract')) setFontSize(fontSize - config.appearance.fontSizeStep);
    else if (event.ctrlKey && (event.key === '0' || event.code === 'Numpad0')) setFontSize(config.appearance.fontSize);
    else if (event.key === 'F2') renderLayout('original');
    else if (event.key === 'F3') renderLayout('modern');
    else if (event.key === 'F11') { fullscreen = !fullscreen; window.portalConsole.fullscreen(fullscreen); }
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

async function start() {
  config = await window.portalConsole.config();
  document.body.classList.toggle('software-rendering', !config.appearance.hardwareAcceleration);
  mode = config.mode;
  fullscreen = config.fullscreen;
  fontSize = config.appearance.fontSize;
  endingVolume = config.ending.volume;
  window.portalConsole.onData(({ id, data, generation }) => {
    const pane = panes.get(id);
    if (!pane) {
      window.portalConsole.acknowledge(id, generation);
      return;
    }
    if (generation < pane.generation) {
      window.portalConsole.acknowledge(id, generation);
      return;
    }
    pane.generation = generation;
    if (pane.pendingStartup && !pane.startupSawOutput) {
      pane.startupSawOutput = true;
      clearTimeout(pane.startupTimer);
      pane.startupTimer = null;
      scheduleStartup(pane, 150);
    }
    pane.terminal.write(data, () => window.portalConsole.acknowledge(id, generation));
  });
  window.portalConsole.onExit(({ id, exitCode, generation, restarting }) => {
    const pane = panes.get(id);
    if (pane && pane.generation === generation) {
      const status = restarting ? 'shell exited; restarting...' : `shell exited: ${exitCode ?? 'unknown'} (Ctrl+Shift+P, R to restart)`;
      pane.terminal.write(`\r\n\x1b[2m[${status}]\x1b[0m\r\n`);
    }
  });
  for (const spec of terminalSpecs()) await terminalElement(spec);
  bindKeys();
  document.querySelectorAll('#layout-switch [data-layout]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!endingPlayback && !presetDialog.open && !helpDialog.open && !replaceDialog.open) renderLayout(button.dataset.layout);
    });
  });
  document.querySelector('#new-window-button').addEventListener('click', () => {
    if (!endingPlayback && !presetDialog.open && !helpDialog.open && !replaceDialog.open) openNewWindow();
  });
  renderLayout(mode);
}

start().catch((error) => {
  screen.textContent = `PORTAL CONSOLE STARTUP FAILURE\n\n${error.message}`;
  screen.style.whiteSpace = 'pre-wrap';
  screen.style.padding = '4rem';
});
