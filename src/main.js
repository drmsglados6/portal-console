const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, net, dialog } = require('electron');
const pty = require('node-pty');
const { loadConfig, presetNames, resolvePreset, validate } = require('./config');
const { imageToAscii } = require('./ascii-art');
const { loadScene } = require('./ending-scene');
const { importPortalCredits } = require('./portal-import');
const { refreshEnvironment, resolveConsole, prepareConsole } = require('./shell');
const { cwdTracker, currentDirectory } = require('./cwd');
const { newWindowArgs } = require('./window-launch');
const { readInstallation } = require('./installation');
const { normalizeSource, resolveMedia } = require('./media');

const sessions = new Map();
const logoCache = new Map();
const OUTPUT_HIGH_WATER = 1024 * 1024;
const OUTPUT_LOW_WATER = 256 * 1024;
const OUTPUT_CHUNK = 64 * 1024;
const RESTART_WINDOW_MS = 10000;
const MAX_UNEXPECTED_EXITS = 3;
let mainWindow;
let config;
let endingMedia;

function configuredEnding() {
  if (endingMedia) return endingMedia;
  if (config.ending.source === 'scene' || config.ending.scene) {
    endingMedia = { scene: loadScene(config.ending.scene), audio: null, source: 'scene' };
  } else if (config.ending.source === 'demo') {
    endingMedia = { scene: loadScene(), audio: null, source: 'demo' };
  } else {
    try {
      endingMedia = importPortalCredits(config.ending);
      diagnostic(`Loaded ending data from local Portal installation: ${endingMedia.portalPath}`);
    } catch (error) {
      if (config.ending.source === 'portal') throw error;
      diagnostic(`Portal ending import unavailable; using demo: ${error.message}`);
      endingMedia = { scene: loadScene(), audio: null, source: 'demo' };
    }
  }
  return endingMedia;
}

function diagnostic(message) {
  try {
    const timestamp = new Date().toISOString();
    const directory = process.env.PORTAL_CONSOLE_LOG_DIR || path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'diagnostics.log'), `${timestamp} ${message}\n`);
  } catch {}
}

function flushOutput(session) {
  if (session.outputInFlight || !session.pendingOutput || session.sender.isDestroyed()) return;
  const data = session.pendingOutput.slice(0, OUTPUT_CHUNK);
  session.pendingOutput = session.pendingOutput.slice(data.length);
  session.outputInFlight = true;
  session.sender.send('terminal:data', { id: session.id, data, generation: session.generation });
}

function queueOutput(session, child, generation, data) {
  if (session.child !== child || session.generation !== generation) return;
  session.pendingOutput += data;
  if (!session.paused && session.pendingOutput.length >= OUTPUT_HIGH_WATER) {
    session.child.pause();
    session.paused = true;
    diagnostic(`PTY ${session.id} paused at ${session.pendingOutput.length} buffered characters`);
  }
  flushOutput(session);
}

function spawnSession(session, retainedCwd) {
  const consoleProfile = resolveConsole(config, session.id);
  const prepared = prepareConsole(consoleProfile, session.cols, session.rows, retainedCwd);
  session.cwdTracker = cwdTracker(prepared.options.cwd, prepared.token, prepared.authoritative);
  session.cwdAuthoritative = prepared.authoritative;
  const child = pty.spawn(
    prepared.command,
    prepared.args,
    prepared.options
  );
  const generation = session.generation + 1;
  session.child = child;
  session.generation = generation;
  session.pendingOutput = '';
  session.outputInFlight = false;
  session.paused = false;
  child.onData((data) => {
    if (session.child !== child || session.generation !== generation) return;
    session.cwdTracker.feed(data);
    queueOutput(session, child, generation, data);
  });
  child.onExit(({ exitCode }) => {
    if (session.child !== child || session.generation !== generation) return;
    session.child = null;
    const now = Date.now();
    session.recentExits = session.recentExits.filter((time) => now - time < RESTART_WINDOW_MS);
    session.recentExits.push(now);
    const restarting = session.recentExits.length <= MAX_UNEXPECTED_EXITS && sessions.get(session.id) === session && !session.sender.isDestroyed();
    diagnostic(`PTY ${session.id} exited: ${exitCode ?? 'unknown'}; restarting: ${restarting}`);
    if (!session.sender.isDestroyed()) session.sender.send('terminal:exit', { id: session.id, exitCode, generation, restarting });
    if (restarting) {
      session.restartTimer = setTimeout(() => {
        session.restartTimer = null;
        if (sessions.get(session.id) !== session || session.child || session.sender.isDestroyed()) return;
        try {
          spawnSession(session);
        } catch (error) {
          diagnostic(`PTY ${session.id} restart failed: ${error.stack || error.message}`);
          if (!session.sender.isDestroyed()) session.sender.send('terminal:exit', { id: session.id, exitCode: null, generation, restarting: false });
        }
      }, 300);
    }
  });
  diagnostic(`PTY ${session.id} started generation ${generation} with profile ${consoleProfile.name}`);
  return generation;
}

async function restartSession(session, preserveCwd = true) {
  const directory = preserveCwd ? await currentDirectory(session.child, session.cwdTracker, session.cwdAuthoritative) : undefined;
  clearTimeout(session.restartTimer);
  session.restartTimer = null;
  session.recentExits = [];
  const previous = session.child;
  session.child = null;
  if (previous) previous.kill();
  return spawnSession(session, directory);
}

function ownedSession(event, id) {
  const session = sessions.get(id);
  return session && session.owner === event.sender.id ? session : null;
}

function installIpc() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F11') {
          event.preventDefault();
          if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('media:maximize', contents.id);
        } else {
          let request;
          if (input.key === 'F1' || input.control && input.shift && input.code === 'KeyH') request = { action: 'help' };
          else if (input.control && input.key === 'Tab') request = { action: 'cycle', value: input.shift ? -1 : 1 };
          else if (input.control && !input.shift && (['1', '2'].includes(input.key) || ['Digit1', 'Digit2'].includes(input.code))) request = { action: 'select', value: Number(['Digit1', 'Digit2'].includes(input.code) ? input.code.slice(-1) : input.key) };
          if (request && mainWindow && !mainWindow.webContents.isDestroyed()) {
            event.preventDefault(); mainWindow.webContents.focus();
            mainWindow.webContents.send('media:control', { guestId: contents.id, ...request });
          }
        }
      });
    }
  });
  ipcMain.handle('app:config', () => config);
  ipcMain.handle('app:new-window', (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid window request');
    const args = newWindowArgs(process.argv.slice(1), app.isPackaged, path.join(__dirname, '..'));
    const child = spawn(process.execPath, args, { cwd: process.cwd(), detached: true, stdio: 'ignore' });
    child.on('error', (error) => diagnostic(`Could not open another window: ${error.message}`));
    child.unref();
    if (!child.pid) throw new Error('Could not start another Portal Console process');
  });
  ipcMain.handle('app:preset-list', (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid preset list request');
    return presetNames();
  });
  ipcMain.handle('app:preset', (event, name) => {
    if (event.sender !== mainWindow?.webContents || typeof name !== 'string') throw new Error('Invalid preset request');
    return resolvePreset(name);
  });
  ipcMain.handle('app:media-url', (event, id) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid media request');
    const pane = config.modern.panes.find((candidate) => candidate.id === id);
    if (!pane || !['image', 'pdf', 'video', 'web'].includes(pane.kind)) throw new Error('Media pane not found');
    return normalizeSource(pane.kind, pane.source).url;
  });
  ipcMain.handle('media:resolve', async (event, { kind, source, sort = config.media.fileSort, descending = config.media.descending } = {}) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid media request');
    const info = resolveMedia(kind, source, sort, descending);
    if (kind === 'image' && !info.remote && /\.tiff?$/i.test(info.source)) {
      const png = await require('sharp')(info.source).png().toBuffer();
      info.url = `data:image/png;base64,${png.toString('base64')}`;
    }
    return info;
  });
  ipcMain.handle('media:pdf-data', async (event, source) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid PDF request');
    const info = normalizeSource('pdf', source);
    const limit = 128 * 1024 * 1024;
    let buffer;
    if (info.remote) {
      const response = await net.fetch(info.url);
      if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
      if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); throw new Error('PDF exceeds 128 MiB'); }
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > limit) { await reader.cancel(); throw new Error('PDF exceeds 128 MiB'); }
        chunks.push(Buffer.from(value));
      }
      buffer = Buffer.concat(chunks);
    } else {
      if (fs.statSync(info.source).size > limit) throw new Error('PDF exceeds 128 MiB');
      buffer = await fs.promises.readFile(info.source);
    }
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
  ipcMain.handle('media:choose-file', async (event) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid file chooser request');
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Open image, PDF or video' });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('app:set-layout', (event, layout) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Invalid layout request');
    validate({ ...config, mode: 'modern', modern: layout });
    config.modern = layout;
  });
  ipcMain.on('app:diagnostic', (_event, message) => {
    if (typeof message === 'string' && message.length <= 500) diagnostic(`Renderer: ${message}`);
  });
  ipcMain.handle('ending:scene', () => {
    const media = configuredEnding();
    return { scene: media.scene, source: media.source, hasAudio: Boolean(media.audio) };
  });
  ipcMain.handle('ending:audio', () => {
    const audio = configuredEnding().audio;
    return audio ? audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) : null;
  });
  ipcMain.handle('clipboard:read', () => clipboard.readText());
  ipcMain.handle('clipboard:write', (_event, value) => {
    if (typeof value !== 'string' || value.length > 10 * 1024 * 1024) throw new Error('Invalid clipboard text');
    clipboard.writeText(value);
  });
  ipcMain.handle('app:logo-art', (_event, request) => {
    const columns = Math.max(8, Math.min(160, Number(request?.columns) || 64));
    const rows = Math.max(4, Math.min(80, Number(request?.rows) || 24));
    const key = `${columns}x${rows}`;
    if (!logoCache.has(key)) {
      const conversion = imageToAscii(config.logo, columns, rows).catch((error) => {
        logoCache.delete(key);
        throw error;
      });
      logoCache.set(key, conversion);
      if (logoCache.size > 40) logoCache.delete(logoCache.keys().next().value);
    }
    return logoCache.get(key);
  });
  ipcMain.handle('terminal:create', async (event, request) => {
    const id = String(request?.id || '');
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new Error('Invalid terminal id');
    if (sessions.has(id)) {
      const existing = sessions.get(id);
      return { id, generation: existing.generation };
    }
    const cols = Math.max(2, Math.min(500, Number(request?.cols) || 80));
    const rows = Math.max(1, Math.min(300, Number(request?.rows) || 24));
    const session = {
      id, child: null, owner: event.sender.id, sender: event.sender, cols, rows, generation: 0,
      pendingOutput: '', outputInFlight: false, paused: false, restartTimer: null, recentExits: []
    };
    sessions.set(id, session);
    try {
      await refreshEnvironment();
      return { id, generation: spawnSession(session) };
    } catch (error) {
      sessions.delete(id);
      throw error;
    }
  });
  ipcMain.handle('terminal:restart', async (event, { id, preserveCwd = true } = {}) => {
    const session = ownedSession(event, id);
    if (!session) throw new Error('Terminal session not found');
    if (typeof preserveCwd !== 'boolean') throw new Error('Invalid restart mode');
    const refreshed = await refreshEnvironment(true);
    diagnostic(`Environment refreshed before restarting PTY ${id}: ${refreshed} registry variables`);
    return { id, generation: await restartSession(session, preserveCwd) };
  });
  ipcMain.handle('terminal:close', (event, id) => {
    const session = ownedSession(event, id);
    if (!session) throw new Error('Terminal session not found');
    sessions.delete(id);
    clearTimeout(session.restartTimer);
    session.child?.kill();
  });
  ipcMain.on('terminal:write', (event, { id, data } = {}) => {
    const session = ownedSession(event, id);
    if (session?.child && typeof data === 'string' && data.length <= 65536) session.child.write(data);
  });
  ipcMain.on('terminal:resize', (event, { id, cols, rows } = {}) => {
    const session = ownedSession(event, id);
    cols = Math.max(2, Math.min(500, Number(cols) || 0));
    rows = Math.max(1, Math.min(300, Number(rows) || 0));
    if (session) {
      session.cols = cols;
      session.rows = rows;
      session.child?.resize(cols, rows);
    }
  });
  ipcMain.on('terminal:ack', (event, { id, generation } = {}) => {
    const session = ownedSession(event, id);
    if (!session || session.generation !== generation) return;
    session.outputInFlight = false;
    if (session.paused && session.pendingOutput.length <= OUTPUT_LOW_WATER) {
      session.child?.resume();
      session.paused = false;
      diagnostic(`PTY ${session.id} resumed`);
    }
    flushOutput(session);
  });
  ipcMain.on('app:fullscreen', (_event, value) => mainWindow?.setFullScreen(Boolean(value)));
  ipcMain.on('app:quit', (event) => {
    if (event.sender === mainWindow?.webContents) app.quit();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#050301',
    autoHideMenuBar: true,
    fullscreen: config.fullscreen,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      plugins: true
    }
  });
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  const ownerId = mainWindow.webContents.id;
  mainWindow.webContents.on('render-process-gone', (_event, details) => diagnostic(`Renderer gone: ${JSON.stringify(details)}`));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.alt && input.shift && input.code === 'KeyQ') {
      event.preventDefault();
      app.quit();
    }
  });
  mainWindow.webContents.on('unresponsive', () => {
    diagnostic('Renderer became unresponsive; leaving fullscreen');
    mainWindow?.setFullScreen(false);
  });
  mainWindow.webContents.on('responsive', () => diagnostic('Renderer became responsive again'));
  mainWindow.webContents.on('destroyed', () => {
    for (const [id, session] of sessions) {
      if (session.owner === ownerId) {
        clearTimeout(session.restartTimer);
        session.child?.kill();
        sessions.delete(id);
      }
    }
  });
}

if (process.argv.includes('--preset-list')) {
  process.stdout.write(`${presetNames().join('\n')}\n`);
  app.quit();
} else {
  config = loadConfig(process.argv.slice(1));
  if (!config.appearance.hardwareAcceleration) app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.whenReady().then(() => {
    diagnostic(`Started ${app.getVersion()}, hardware acceleration: ${config.appearance.hardwareAcceleration}`);
    try {
      const directory = process.platform === 'darwin' ? path.resolve(process.execPath, '../../..') : path.dirname(process.execPath);
      const record = app.isPackaged ? readInstallation(directory) : null;
      const method = process.env.PORTABLE_EXECUTABLE_FILE ? 'windows-portable'
        : process.env.APPIMAGE ? 'linux-appimage' : record?.method || (app.isPackaged ? 'manual/unrecorded' : 'development');
      diagnostic(`Installation method: ${method}; recorded version: ${record?.version || 'unrecorded'}`);
    } catch (error) { diagnostic(`Installation record could not be read: ${error.message}`); }
    installIpc();
    createWindow();
    const emergencyShortcut = globalShortcut.register('Control+Alt+Shift+Q', () => {
      diagnostic('Emergency exit shortcut used');
      app.quit();
    });
    if (!emergencyShortcut) diagnostic('Could not register emergency exit shortcut');
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    for (const session of sessions.values()) {
      clearTimeout(session.restartTimer);
      session.child?.kill();
    }
    sessions.clear();
  });
  app.on('child-process-gone', (_event, details) => diagnostic(`Child process gone: ${JSON.stringify(details)}`));
  process.on('uncaughtException', (error) => {
    diagnostic(`Uncaught exception: ${error.stack || error.message}`);
    app.exit(1);
  });
  process.on('unhandledRejection', (error) => diagnostic(`Unhandled rejection: ${error?.stack || error}`));
}
