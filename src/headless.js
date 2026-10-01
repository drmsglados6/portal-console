const pty = require('node-pty');
const { Terminal } = require('@xterm/headless');
const { loadConfig } = require('./config');
const { imageToAscii } = require('./ascii-art');
const { loadScene } = require('./ending-scene');
const { prepareScene, sceneState } = require('./ending-state');
const { importPortalCredits } = require('./portal-import');
const { refreshEnvironment, resolveConsole, spawnOptions } = require('./shell');
const { portalCommandInput } = require('./portal-command');

const ESC = '\x1b[';
const ORANGE = `${ESC}38;2;255;157;32m`;
const DIM = `${ESC}38;2;120;67;14m`;
const RESET = `${ESC}0m`;

function tracks(values, total) {
  const weights = values.map((value) => {
    const match = String(value).match(/^([\d.]+)(fr|%)?$/);
    if (!match) return 1;
    return match[2] === '%' ? (Number(match[1]) / 100) * total : Number(match[1]);
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const result = weights.map((weight) => Math.max(1, Math.floor((weight / sum) * total)));
  result[result.length - 1] += total - result.reduce((a, b) => a + b, 0);
  return result;
}

function rectangles(config, width, height) {
  if (config.mode === 'original') {
    const left = Math.floor(width / 2);
    const top = Math.floor(height / 2);
    return new Map([
      ['main', { x: 0, y: 0, width: left, height }],
      ['aux', { x: left, y: 0, width: width - left, height: top }],
      ['logo', { x: left, y: top, width: width - left, height: height - top }]
    ]);
  }
  const rows = config.modern.areas.map((row) => row.trim().split(/\s+/));
  const widths = tracks(config.modern.columns, width);
  const heights = tracks(config.modern.rows, height);
  const xOffsets = widths.map((_, index) => widths.slice(0, index).reduce((a, b) => a + b, 0));
  const yOffsets = heights.map((_, index) => heights.slice(0, index).reduce((a, b) => a + b, 0));
  const rects = new Map();
  for (const pane of config.modern.panes) {
    const cells = [];
    rows.forEach((row, y) => row.forEach((id, x) => { if (id === pane.id) cells.push({ x, y }); }));
    if (!cells.length) continue;
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    const maxY = Math.max(...cells.map((cell) => cell.y));
    rects.set(pane.id, {
      x: xOffsets[minX], y: yOffsets[minY],
      width: widths.slice(minX, maxX + 1).reduce((a, b) => a + b, 0),
      height: heights.slice(minY, maxY + 1).reduce((a, b) => a + b, 0)
    });
  }
  return rects;
}

function frame(rect, title, focused) {
  const color = focused ? ORANGE : DIM;
  const inner = Math.max(0, rect.width - 2);
  const label = ` ${title} `;
  const top = label.slice(0, inner).padEnd(inner, '─');
  let output = `${color}${ESC}${rect.y + 1};${rect.x + 1}H┌${top}┐`;
  for (let row = 1; row < rect.height - 1; row += 1) {
    output += `${ESC}${rect.y + row + 1};${rect.x + 1}H│${ESC}${rect.x + rect.width}G│`;
  }
  if (rect.height > 1) output += `${ESC}${rect.y + rect.height};${rect.x + 1}H└${'─'.repeat(inner)}┘`;
  return output;
}

function terminalText(pane) {
  const buffer = pane.term.buffer.active;
  let output = '';
  for (let row = 0; row < pane.rows; row += 1) {
    const line = buffer.getLine(buffer.viewportY + row);
    const text = line ? line.translateToString(true, 0, pane.cols) : '';
    output += `${ORANGE}${ESC}${pane.rect.y + row + 2};${pane.rect.x + 2}H${text.padEnd(pane.cols)}`;
  }
  return output;
}

function logoText(rect, art) {
  const lines = art.split('\n');
  const startY = rect.y + Math.max(1, Math.floor((rect.height - lines.length) / 2));
  return lines.map((line, index) => {
    const x = rect.x + Math.max(1, Math.floor((rect.width - line.length) / 2));
    return `${ORANGE}${ESC}${startY + index + 1};${x + 1}H${line}`;
  }).join('');
}

async function run(argv = []) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Headless mode requires an interactive TTY.');
  }
  const config = loadConfig(argv.filter((arg) => arg !== '--headless'));
  const panes = new Map();
  let focusedId;
  let prefix = false;
  let commandMode = false;
  let commandStatus = '';
  let endingScene;
  let endingPlayback;
  let endingTimer;
  let scheduled = false;
  let closed = false;
  let logoSize = '';
  let logoGeneration = 0;

  const specs = config.mode === 'original'
    ? [{ id: 'main', title: 'PRIMARY TERMINAL', kind: 'terminal' }, { id: 'aux', title: 'AUXILIARY TERMINAL', kind: 'terminal' }, { id: 'logo', title: 'APERTURE SCIENCE', kind: 'logo' }]
    : config.modern.panes;
  let logoArt = '';

  function endingTime() {
    if (!endingPlayback) return 0;
    return endingPlayback.paused ? endingPlayback.baseTime : Math.min(endingScene.durationMs, endingPlayback.baseTime + performance.now() - endingPlayback.baseNow);
  }

  function endingTick() {
    if (!endingPlayback || endingPlayback.paused || closed) return;
    const time = endingTime();
    draw();
    if (time >= endingScene.durationMs) {
      endingPlayback.baseTime = endingScene.durationMs;
      endingPlayback.paused = true;
      commandStatus = 'PLAYBACK COMPLETE  0 RESTART  Q RETURN';
      return;
    }
    endingTimer = setTimeout(endingTick, 33);
  }

  function startEnding() {
    if (config.mode !== 'original') {
      commandStatus = 'ENDING PLAYBACK REQUIRES ORIGINAL MODE';
      draw();
      return;
    }
    try {
      if (!endingScene) {
        if (config.ending.source === 'scene' || config.ending.scene) endingScene = prepareScene(loadScene(config.ending.scene));
        else if (config.ending.source === 'demo') endingScene = prepareScene(loadScene());
        else {
          try { endingScene = prepareScene(importPortalCredits({ ...config.ending, playAudio: false }).scene); }
          catch (error) {
            if (config.ending.source === 'portal') throw error;
            endingScene = prepareScene(loadScene());
          }
        }
      }
      commandMode = false;
      endingPlayback = { baseTime: 0, baseNow: performance.now(), paused: false };
      endingTick();
    } catch (error) {
      commandStatus = `PLAYBACK FAILED: ${error.message}`;
      draw();
    }
  }

  function stopEnding() {
    clearTimeout(endingTimer);
    endingPlayback = null;
    commandMode = true;
    commandStatus = 'E PLAY ENDING  R RESTART  ESC/I TERMINAL';
    draw();
  }

  function seekEnding(offset, absolute = false) {
    endingPlayback.baseTime = Math.max(0, Math.min(endingScene.durationMs, absolute ? offset : endingTime() + offset));
    endingPlayback.baseNow = performance.now();
    draw();
  }

  function sceneText(rect, value, bottom = false) {
    const width = Math.max(1, rect.width - 2);
    const height = Math.max(1, rect.height - 2);
    const source = value.split('\n');
    const lines = bottom ? source.slice(-height) : source.slice(0, height);
    return lines.map((line, index) => {
      const row = bottom ? rect.y + rect.height - lines.length + index : rect.y + index + 1;
      return `${ORANGE}${ESC}${row + 1};${rect.x + 2}H${line.slice(0, width).padEnd(width)}`;
    }).join('');
  }

  function resize() {
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;
    const rects = rectangles(config, width, height);
    for (const spec of specs) {
      const pane = panes.get(spec.id);
      const rect = rects.get(spec.id);
      if (!pane || !rect) continue;
      pane.rect = rect;
      pane.cols = Math.max(2, rect.width - 2);
      pane.rows = Math.max(1, rect.height - 2);
      if (pane.term) {
        pane.term.resize(pane.cols, pane.rows);
        pane.child?.resize(pane.cols, pane.rows);
      }
    }
    draw();
    const logo = [...panes.values()].find((pane) => pane.spec.kind === 'logo');
    if (logo) {
      const columns = Math.max(8, logo.rect.width - 4);
      const rows = Math.max(4, logo.rect.height - 4);
      const size = `${columns}x${rows}`;
      if (size !== logoSize) {
        logoSize = size;
        const generation = ++logoGeneration;
        imageToAscii(config.logo, columns, rows).then((art) => {
          if (generation === logoGeneration) {
            logoArt = art;
            draw();
          }
        }).catch((error) => {
          logoArt = `LOGO CONVERSION FAILURE\n${error.message}`;
          draw();
        });
      }
    }
  }

  function draw() {
    if (scheduled || closed) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      let output = `${ESC}?25l${ESC}2J`;
      const ending = endingPlayback ? sceneState(endingScene, endingTime()) : null;
      for (const pane of panes.values()) {
        output += frame(pane.rect, pane.spec.title || pane.spec.id, pane.spec.id === focusedId);
        if (ending) {
          if (pane.spec.id === 'main') output += sceneText(pane.rect, ending.left);
          else if (pane.spec.id === 'aux') output += sceneText(pane.rect, ending.credits, true);
          else {
            const art = ending.frame === '$logo' ? logoArt : endingScene.frames[ending.frame] || '';
            output += sceneText(pane.rect, art);
          }
        } else if (pane.spec.kind === 'logo') output += logoText(pane.rect, logoArt);
        else if (pane.term) output += terminalText(pane);
        else output += sceneText(pane.rect, `[${pane.spec.kind.toUpperCase()}] ${pane.spec.source}`, true);
      }
      const focused = panes.get(focusedId);
      if (endingPlayback) {
        const status = `-- PLAYBACK -- ${Math.floor(endingTime() / 1000)}/${Math.ceil(endingScene.durationMs / 1000)}s  SPACE PAUSE  H/L SEEK  Q STOP`;
        output += `${ORANGE}${ESC}${process.stdout.rows || 24};1H${status.slice(0, process.stdout.columns || 80)}`;
      } else if (commandMode) {
        const status = `-- COMMAND -- ${commandStatus || 'R RESTART  H/L SELECT  ESC/I TERMINAL'}`;
        output += `${ORANGE}${ESC}${process.stdout.rows || 24};1H${status.slice(0, process.stdout.columns || 80)}`;
      } else if (focused?.term) {
        const buffer = focused.term.buffer.active;
        output += `${ORANGE}${ESC}${focused.rect.y + buffer.cursorY + 2};${focused.rect.x + buffer.cursorX + 2}H${ESC}?25h`;
      }
      process.stdout.write(output + RESET);
    }, 16);
  }

  function focus(id) {
    if (panes.get(id)?.term) focusedId = id;
    draw();
  }

  function cleanup(code = 0) {
    if (closed) return;
    closed = true;
    for (const pane of panes.values()) pane.child?.kill();
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(`${RESET}${ESC}?25h${ESC}?1049l`);
    process.exitCode = code;
  }

  function startPane(pane) {
    const previous = pane.child;
    pane.child = null;
    previous?.kill();
    const consoleProfile = resolveConsole(config, pane.spec.id);
    const child = pty.spawn(consoleProfile.command, consoleProfile.args, spawnOptions(pane.cols, pane.rows, consoleProfile.cwd));
    const generation = (pane.generation || 0) + 1;
    pane.generation = generation;
    pane.child = child;
    child.onData((data) => {
      if (pane.child === child && pane.generation === generation) pane.term.write(data, draw);
    });
    child.onExit(() => {
      if (pane.child === child && pane.generation === generation) pane.child = null;
      draw();
    });
  }

  async function restartFocused() {
    const pane = panes.get(focusedId);
    if (!pane?.term || pane.restarting) return;
    pane.restarting = true;
    commandStatus = `RESTARTING ${pane.spec.title}...`;
    draw();
    try {
      await refreshEnvironment(true);
      pane.term.reset();
      startPane(pane);
      commandStatus = `${pane.spec.title} RESTARTED`;
    } catch (error) {
      commandStatus = `RESTART FAILED: ${error.message}`;
    } finally {
      pane.restarting = false;
      draw();
    }
  }

  await refreshEnvironment();
  for (const spec of specs) {
    const pane = { spec, rect: { x: 0, y: 0, width: 20, height: 10 }, cols: 18, rows: 8 };
    if (spec.kind === 'terminal') {
      pane.commandInput = portalCommandInput();
      pane.term = new Terminal({ cols: pane.cols, rows: pane.rows, scrollback: 1000, allowProposedApi: true });
      startPane(pane);
      if (!focusedId) focusedId = spec.id;
    }
    panes.set(spec.id, pane);
  }

  process.stdout.write(`${ESC}?1049h${ESC}?7l${ESC}2J`);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    const data = chunk.toString('utf8');
    const terminals = [...panes.values()].filter((pane) => pane.term);
    if (endingPlayback) {
      if (data === ' ' ) {
        if (endingPlayback.paused) {
          endingPlayback.paused = false;
          endingPlayback.baseNow = performance.now();
          endingTick();
        } else {
          endingPlayback.baseTime = endingTime();
          endingPlayback.paused = true;
          clearTimeout(endingTimer);
          draw();
        }
      } else if (data === '\x1b' || data.toLowerCase() === 'q') stopEnding();
      else if (data.toLowerCase() === 'h' || data === '\x1b[D') seekEnding(-config.ending.seekStepMs);
      else if (data.toLowerCase() === 'l' || data === '\x1b[C') seekEnding(config.ending.seekStepMs);
      else if (data === '0') seekEnding(0, true);
      return;
    }
    if (commandMode) {
      if (data === '\x1b' || data.toLowerCase() === 'i') {
        commandMode = false;
        commandStatus = '';
      } else if (data.toLowerCase() === 'r') restartFocused();
      else if (data.toLowerCase() === 'e') startEnding();
      else if (['h', 'k'].includes(data.toLowerCase())) {
        const current = terminals.findIndex((pane) => pane.spec.id === focusedId);
        focus(terminals[(current - 1 + terminals.length) % terminals.length]?.spec.id);
      } else if (['j', 'l'].includes(data.toLowerCase())) {
        const current = terminals.findIndex((pane) => pane.spec.id === focusedId);
        focus(terminals[(current + 1) % terminals.length]?.spec.id);
      }
      draw();
      return;
    }
    if (prefix) {
      prefix = false;
      if (data === '1') focus(terminals[0]?.spec.id);
      else if (data === '2') focus(terminals[1]?.spec.id);
      else if (data === 'n') {
        const current = terminals.findIndex((pane) => pane.spec.id === focusedId);
        focus(terminals[(current + 1) % terminals.length]?.spec.id);
      } else if (data === 'c') {
        commandMode = true;
        draw();
      } else if (data === 'q') cleanup();
      else if (data === '\x02') panes.get(focusedId)?.child?.write(data);
      return;
    }
    if (data === '\x02') prefix = true;
    else {
      const pane = panes.get(focusedId);
      const command = pane?.commandInput?.(data);
      if (command?.type === 'exit') cleanup();
      else if (command?.type === 'help' || command?.type === 'preset') {
        pane.child?.write('\x03');
        pane.commandInput.reset();
        commandMode = true;
        commandStatus = command.type === 'help'
          ? 'PORTAL-HELP: PORTAL-EXIT QUIT  PORTAL-PRESET GUI ONLY  CTRL+B C COMMAND  ESC RETURN'
          : 'LIVE PRESET SWITCHING IS AVAILABLE IN THE GUI VERSION';
        draw();
      } else pane?.child?.write(data);
    }
  });
  process.stdout.on('resize', resize);
  process.on('SIGINT', () => cleanup(130));
  process.on('SIGTERM', () => cleanup(143));
  process.on('exit', () => cleanup(process.exitCode || 0));
  resize();
}

module.exports = { rectangles, run, tracks };
