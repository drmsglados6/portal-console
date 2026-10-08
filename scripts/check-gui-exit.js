const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function targets(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function run() {
  const checkPreset = process.argv.includes('--preset');
  const checkInvalid = process.argv.includes('--invalid');
  const checkMedia = process.argv.includes('--media');
  const checkWheel = process.argv.includes('--wheel');
  const checkLayout = process.argv.includes('--layout');
  const checkNewWindow = process.argv.includes('--new-window');
  const checkRegex = process.argv.includes('--regex');
  const checkCrt = process.argv.includes('--crt');
  const checkHelp = process.argv.includes('--help');
  const checkCwd = process.argv.includes('--cwd');
  const packaged = process.argv.includes('--packaged');
  const sourceId = process.argv.includes('--third') ? 'third' : 'main';
  const port = await availablePort();
  const electron = packaged ? path.resolve('release', process.platform === 'darwin' ? `${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/portal-console.app/Contents/MacOS/portal-console`
    : process.platform === 'win32' ? 'win-unpacked/portal-console.exe' : 'linux-unpacked/portal-console') : require('electron');
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-gui-check-'));
  let mainMediaDirectory = path.join(configHome, 'main directory');
  let auxMediaDirectory = path.join(configHome, 'aux directory');
  if (checkWheel) {
    const mock = path.join(configHome, 'mouse-server.js');
    fs.writeFileSync(mock, "process.stdout.write('\\x1b[?1000h\\x1b[?1006hMOCK_READY\\r\\n'); for(let i=0;i<120;i++)process.stdout.write('LINE_'+i+'\\r\\n'); process.stdin.resume(); process.stdin.on('data', () => {});\n");
    const folder = path.join(configHome, 'portal-console');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify({
      mode: 'modern', fullscreen: false,
      consoles: { default: 'mock', profiles: { mock: { command: process.execPath, args: [mock] } } },
      modern: { columns: ['1fr'], rows: ['1fr'], areas: ['main'], panes: [{ id: 'main', kind: 'terminal', title: 'MOUSE' }] }
    }));
  }
  if (checkRegex) {
    const folder = path.join(configHome, 'portal-console');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify({ controls: { closeSelectionSyntax: 'regex' } }));
  }
  let workDirectory = path.join(configHome, 'work dir');
  if (checkCwd) {
    fs.mkdirSync(workDirectory);
    workDirectory = fs.realpathSync.native(workDirectory);
    const folder = path.join(configHome, 'portal-console');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify({ mode: 'modern', fullscreen: false,
      modern: { columns: ['1fr'], rows: ['1fr'], areas: ['main'], panes: [{ id: 'main', kind: 'terminal', title: 'MAIN' }] } }));
  }
  if (checkMedia) {
    for (const directory of [mainMediaDirectory, auxMediaDirectory]) {
      fs.mkdirSync(directory);
      fs.copyFileSync(path.join(__dirname, '..', 'assets/aperture-science.svg'), path.join(directory, 'relative.svg'));
    }
    mainMediaDirectory = fs.realpathSync.native(mainMediaDirectory);
    auxMediaDirectory = fs.realpathSync.native(auxMediaDirectory);
    fs.copyFileSync(path.join(__dirname, '..', 'assets/aperture-science.svg'), path.join(configHome, 'image2.svg'));
    fs.copyFileSync(path.join(__dirname, '..', 'assets/aperture-science.svg'), path.join(configHome, 'image10.svg'));
    const pdf = path.join(configHome, 'sample.pdf');
    const pageOne = 'BT /F1 20 Tf 20 100 Td (PAGE ONE) Tj ET';
    const pageTwo = 'BT /F1 20 Tf 20 100 Td (PAGE TWO) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(pageOne)} >>\nstream\n${pageOne}\nendstream`,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
      `<< /Length ${Buffer.byteLength(pageTwo)} >>\nstream\n${pageTwo}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let contents = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(contents));
      contents += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(contents);
    contents += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    fs.writeFileSync(pdf, contents);
    fs.writeFileSync(path.join(configHome, 'sample2.pdf'), contents);
    const folder = path.join(configHome, 'portal-console');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify({
      mode: 'modern', fullscreen: false, media: { videoSeekSeconds: 0.2 },
      consoles: { profiles: {
        'main-directory': { command: process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash', args: process.platform === 'win32' ? ['-NoLogo'] : ['-l'], cwd: mainMediaDirectory },
        'aux-directory': { command: process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash', args: process.platform === 'win32' ? ['-NoLogo'] : ['-l'], cwd: auxMediaDirectory }
      } },
      modern: {
        columns: ['1fr', '1fr', '1fr'], rows: ['1fr', '1fr'], areas: ['main image web', 'aux pdf web'], panes: [
          { id: 'main', kind: 'terminal', console: 'main-directory', title: 'MAIN', startupCommand: 'echo __PORTAL_STARTUP__', appearance: { fontSize: 18, foreground: '#00ff00', background: '#111111' } },
          { id: 'aux', kind: 'terminal', console: 'aux-directory', title: 'AUX' },
          { id: 'image', kind: 'image', title: 'IMAGE', source: path.join(configHome, 'image2.svg') },
          { id: 'pdf', kind: 'pdf', title: 'PDF', source: pdf },
          { id: 'web', kind: 'web', title: 'WEB', source: 'https://example.com/' }
        ]
      }
    }));
  }
  fs.writeFileSync(path.join(configHome, 'package.json'), JSON.stringify({ name: 'portal-gui-exit-check', main: 'main.js' }));
  const mockWindowLaunch = checkNewWindow ? "const cp=require('node:child_process'),realSpawn=cp.spawn; cp.spawn=function(file,args,options){if(file===process.execPath&&options?.detached){process.stdout.write('NEW_WINDOW_SPAWN '+JSON.stringify(args)+'\\n');return {pid:12345,on(){return this},unref(){}};}return realSpawn.apply(this,arguments)};" : '';
  fs.writeFileSync(path.join(configHome, 'main.js'), `${mockWindowLaunch} const {ipcMain,BrowserWindow}=require('electron'); ipcMain.on('terminal:write',(_event,value)=>process.stdout.write('WRITE '+JSON.stringify(value)+'\\n')); ipcMain.on('app:quit',()=>process.stdout.write('QUIT\\n')); require(${JSON.stringify(path.join(__dirname, '..', 'src', 'main.js'))}); ${checkWheel ? "setTimeout(()=>BrowserWindow.getAllWindows()[0]?.webContents.send('terminal:data',{id:'main',data:'\\x1b[?1000h\\x1b[?1006h',generation:1}),4000);" : ''}\n`);
  if (checkMedia) fs.appendFileSync(path.join(configHome, 'main.js'), "require('electron').app.whenReady().then(()=>{ipcMain.removeHandler('clipboard:read');ipcMain.handle('clipboard:read',()=> 'https://example.org/');BrowserWindow.getAllWindows()[0]?.webContents.setBackgroundThrottling(false);});\n");
  const child = spawn(electron, [...(packaged ? ['--config', path.join(configHome, 'portal-console', 'config.json'), `--user-data-dir=${path.join(configHome, 'runtime')}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] : [configHome]), '--windowed', ...(checkPreset ? ['--preset', '3x2'] : []), `--remote-debugging-port=${port}`], {
    stdio: 'pipe', env: { ...process.env, APPDATA: configHome, XDG_CONFIG_HOME: configHome, PORTAL_CONSOLE_LOG_DIR: path.join(configHome, 'logs') }
  });
  let errors = '';
  let writes = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  child.stdout.on('data', (chunk) => { writes += chunk; });
  let exited = false;
  child.on('exit', () => { exited = true; });
  try {
    let target;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (exited) throw new Error(`GUI exited before test: ${errors}`);
      try { target = (await targets(port)).find((entry) => entry.type === 'page' && entry.url.includes('index.html')); } catch {}
      if (target) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!target) throw new Error(`GUI did not become ready: ${errors}`);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors += `\nRenderer exception: ${JSON.stringify(message.params.exceptionDetails)}`;
      if (message.method === 'Runtime.consoleAPICalled') errors += `\nRenderer console: ${JSON.stringify(message.params.args)}`;
      if (message.id && pending.has(message.id)) {
        pending.get(message.id).resolve(message);
        pending.delete(message.id);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`DevTools did not answer ${method}, exited=${exited}, writes=${writes.slice(-2000)}`));
      }, 10000);
      pending.set(requestId, { resolve: (message) => { clearTimeout(timeout); resolve(message); } });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    await send('Runtime.enable');
    let focused;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      focused = await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea')?.focus(); document.activeElement?.className` });
      if (focused.result?.result?.value === 'xterm-helper-textarea') break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (focused.result?.result?.value !== 'xterm-helper-textarea') {
      const state = await send('Runtime.evaluate', { expression: 'document.querySelector("#screen")?.textContent?.slice(0, 500)' });
      throw new Error(`Terminal not focused: ${JSON.stringify(focused)} screen=${JSON.stringify(state)} errors=${errors}`);
    }
    await send('Runtime.evaluate', { expression: "window.__exitEvents=[]; for (const type of ['keydown','input','keyup']) document.querySelector('.xterm-helper-textarea').addEventListener(type, e => window.__exitEvents.push({type, key:e.key, data:e.data, value:e.target.value}))" });
    const enter = async (text) => {
      const result = await send('Input.insertText', { text });
      if (result.error) throw new Error(`Could not type ${text}: ${JSON.stringify(result)}`);
      socket.send(JSON.stringify({ id: ++id, method: 'Input.dispatchKeyEvent', params: {
        type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r'
      } }));
    };
    const typeKeys = async (text) => {
      for (const character of text) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: character, text: character, code: 'Unidentified' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: character, code: 'Unidentified' });
      }
      socket.send(JSON.stringify({ id: ++id, method: 'Input.dispatchKeyEvent', params: {
        type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r'
      } }));
    };
    if (checkHelp) {
      await typeKeys('portal-help');
      let help;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        help = await send('Runtime.evaluate', { expression: `({open:document.querySelector('#help-dialog').open,sections:document.querySelectorAll('#help-content h3').length,text:document.querySelector('#help-content').textContent})`, returnByValue: true });
        if (help.result?.result?.value?.open) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const content = help.result?.result?.value;
      if (!content?.open || content.sections < 7 || !content.text.includes('portal-restart') || !content.text.includes('Command mode R') || !content.text.includes('Ctrl+Shift+Tab')) throw new Error(`Incomplete GUI help: ${JSON.stringify(content)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('#help-close').click()` });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
      const open = await send('Runtime.evaluate', { expression: `document.querySelector('#help-dialog').open` });
      if (!open.result?.result?.value) throw new Error('F1 help failed');
      await send('Runtime.evaluate', { expression: `document.querySelector('#help-close').click()` });
      await typeKeys('portal-restart');
      let restarted;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        restarted = await send('Runtime.evaluate', { expression: `document.querySelector('#mode-indicator').textContent` });
        if (restarted.result?.result?.value?.includes(' RESTARTED')) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!restarted.result?.result?.value?.includes(' RESTARTED')) {
        const state = await send('Runtime.evaluate', { expression: `({focus:document.activeElement?.className,open:document.querySelector('#help-dialog').open,screen:document.querySelector('[data-pane=main] .xterm-rows')?.textContent})`, returnByValue: true });
        throw new Error(`portal-restart failed: ${JSON.stringify(restarted)} state=${JSON.stringify(state)} writes=${writes.slice(-2500)}`);
      }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      console.log('Comprehensive GUI help, F1 and portal-restart verified');
    }
    if (checkCrt) {
      const state = () => send('Runtime.evaluate', { expression: `({
        enabled: document.body.classList.contains('crt-enabled'),
        software: document.body.classList.contains('software-rendering'),
        overlay: getComputedStyle(document.querySelector('.terminal-pane'), '::after').content,
        pointerEvents: getComputedStyle(document.querySelector('.terminal-pane'), '::after').pointerEvents,
        glow: getComputedStyle(document.querySelector('.xterm-rows')).textShadow,
        dialog: document.querySelector('#crt-dialog').open,
        spacing: document.body.style.getPropertyValue('--crt-spacing')
      })`, returnByValue: true });
      let current = (await state()).result.result.value;
      if (!current.enabled || !current.software || current.overlay === 'none' || current.pointerEvents !== 'none' || current.glow === 'none') throw new Error(`CRT software-rendering effects missing: ${JSON.stringify(current)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('#crt-button').click(); document.querySelector('#crt-enabled').click()` });
      current = (await state()).result.result.value;
      if (current.enabled || !current.dialog || current.overlay !== 'none' || current.glow !== 'none') throw new Error(`CRT disable failed: ${JSON.stringify(current)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('#crt-enabled').click(); const slider = document.querySelector('[data-crt=scanlineSpacing]'); slider.value = '6'; slider.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#crt-close').click()` });
      current = (await state()).result.result.value;
      if (!current.enabled || current.dialog || current.spacing !== '6px') throw new Error(`CRT live adjustment failed: ${JSON.stringify(current)}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'P', code: 'KeyP', windowsVirtualKeyCode: 80, modifiers: 10 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 });
      current = (await state()).result.result.value;
      if (current.enabled) throw new Error('Command-mode G did not disable CRT');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      console.log('CRT software rendering, dialog toggle, live adjustment and command-mode toggle verified');
    }
    if (checkCwd) {
      const query = async (label, expected, prefix = '', suffix = '') => {
        await typeKeys(`${prefix}Write-Output ('${label}' + $PWD.ProviderPath)${suffix}`);
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const value = await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=main] .xterm-rows').textContent.includes(${JSON.stringify(label + expected)})` });
          if (value.result?.result?.value) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`Working directory was not ${expected}; ${errors}`);
      };
      const restart = async (reset) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'P', code: 'KeyP', modifiers: 10 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'P', code: 'KeyP', modifiers: 10 });
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: reset ? 'R' : 'r', code: 'KeyR', modifiers: reset ? 8 : 0 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: reset ? 'R' : 'r', code: 'KeyR', modifiers: reset ? 8 : 0 });
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const status = await send('Runtime.evaluate', { expression: "document.querySelector('#mode-indicator').textContent" });
          if (status.result?.result?.value?.includes(reset ? 'RESTARTED (RESET CWD)' : 'RESTARTED (KEEP CWD)')) break;
          if (attempt === 79) throw new Error(`Restart failed: ${JSON.stringify(status)} ${errors}`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      };
      await query('CWD_BEFORE_', workDirectory, `Set-Location -LiteralPath '${workDirectory.replace(/'/g, "''")}';`, ';Start-Sleep -Seconds 10');
      await restart(false);
      await query('CWD_KEPT_', workDirectory);
      await restart(true);
      await query('CWD_RESET_', os.homedir());
      console.log('GUI R retained the current directory and Shift+R restored the profile default');
    }
    if (checkNewWindow) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'N', code: 'KeyN', windowsVirtualKeyCode: 78, modifiers: 10 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'N', code: 'KeyN', windowsVirtualKeyCode: 78, modifiers: 10 });
      for (let attempt = 0; attempt < 40 && !writes.includes('NEW_WINDOW_SPAWN'); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 250));
      if (!writes.includes('NEW_WINDOW_SPAWN')) throw new Error(`Ctrl+Shift+N did not request another process: ${writes}`);
      await send('Runtime.evaluate', { expression: "document.querySelector('#new-window-button').click()" });
      for (let attempt = 0; attempt < 40 && writes.split('NEW_WINDOW_SPAWN').length < 3; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 250));
      if (writes.split('NEW_WINDOW_SPAWN').length !== 3) throw new Error(`New window button did not request another process: ${writes}`);
      console.log('GUI shortcut and button requested separate app processes');
      await send('Runtime.evaluate', { expression: "document.querySelector('[data-pane=main] .xterm-helper-textarea').focus()" });
    }
    if (checkLayout) {
      await send('Runtime.evaluate', { expression: "document.querySelector('#layout-switch [data-layout=modern]').click()" });
      let mode;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        mode = await send('Runtime.evaluate', { expression: "document.querySelector('#screen').className" });
        if (mode.result?.result?.value === 'screen modern') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (mode.result?.result?.value !== 'screen modern') throw new Error(`Modern button failed: ${JSON.stringify(mode)}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50, modifiers: 10 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50, modifiers: 10 });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        mode = await send('Runtime.evaluate', { expression: "document.querySelector('#screen').className" });
        if (mode.result?.result?.value === 'screen original') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (mode.result?.result?.value !== 'screen original') throw new Error(`Ctrl+Shift+2 failed: ${JSON.stringify(mode)}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '3', code: 'Digit3', windowsVirtualKeyCode: 51, modifiers: 10 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '3', code: 'Digit3', windowsVirtualKeyCode: 51, modifiers: 10 });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        mode = await send('Runtime.evaluate', { expression: "document.querySelector('#screen').className" });
        if (mode.result?.result?.value === 'screen modern') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (mode.result?.result?.value !== 'screen modern') throw new Error(`Ctrl+Shift+3 failed: ${JSON.stringify(mode)}`);
      console.log('GUI layout buttons and Ctrl+Shift+2/3 switched modes');
      await send('Runtime.evaluate', { expression: "document.querySelector('[data-pane=main] .xterm-helper-textarea').focus()" });
    }
    if (checkWheel) {
      let area;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        area = await send('Runtime.evaluate', { expression: "({enabled:!!document.querySelector('[data-pane=main] .xterm.enable-mouse-events'),rect:(()=>{const r=document.querySelector('[data-pane=main] .xterm-screen')?.getBoundingClientRect(); return r && {x:r.x+r.width/2,y:r.y+r.height/2}})()})", returnByValue: true });
        if (area.result?.result?.value?.enabled && area.result.result.value.rect) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!area.result?.result?.value?.enabled) {
        const state = await send('Runtime.evaluate', { expression: "document.querySelector('[data-pane=main] .xterm-rows')?.textContent?.slice(0, 900)" });
        throw new Error(`Remote mouse tracking did not activate: ${JSON.stringify(area)} screen=${JSON.stringify(state)} writes=${writes} errors=${errors}`);
      }
      const before = writes.length;
      const { x, y } = area.result.result.value.rect;
      const previous = await send('Runtime.evaluate', { expression: "Number((document.querySelector('[data-pane=main] .xterm-rows')?.textContent.match(/LINE_(\\d+)/g)||[]).at(-1)?.slice(5))" });
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaY: -120, deltaX: 0 });
      await new Promise((resolve) => setTimeout(resolve, 800));
      const wheelOutput = writes.slice(before);
      if (/\\u001b\[<6[45];/.test(wheelOutput) || /\\u001b\[M/.test(wheelOutput)) throw new Error(`Mouse wheel leaked to remote PTY: ${wheelOutput}`);
      const next = await send('Runtime.evaluate', { expression: "Number((document.querySelector('[data-pane=main] .xterm-rows')?.textContent.match(/LINE_(\\d+)/g)||[]).at(-1)?.slice(5))" });
      if (!(next.result?.result?.value < previous.result?.result?.value)) throw new Error(`Local wheel did not scroll history: before=${JSON.stringify(previous)}, after=${JSON.stringify(next)}`);
      const modifierStart = writes.length;
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaY: -120, deltaX: 0, modifiers: 1 });
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (!/\\u001b\[<(?:64|72);/.test(writes.slice(modifierStart))) throw new Error(`Alt+wheel did not reach the remote application: ${writes.slice(modifierStart)}`);
      console.log('GUI wheel stayed local while remote mouse reporting was enabled');
    }
    if (checkMedia) {
      let state;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        state = await send('Runtime.evaluate', { expression: "({media:document.querySelectorAll('#screen .media-pane').length, image:document.querySelector('.media-host img')?.naturalWidth, pdf:document.querySelector('.media-pdf canvas')?.width, page:document.querySelector('.media-pdf')?.dataset.page, startup:document.querySelector('[data-pane=main] .xterm-rows')?.textContent.includes('__PORTAL_STARTUP__'),status:[...document.querySelectorAll('.media-status')].map(e=>e.textContent), guests:[...document.querySelectorAll('#screen webview')].map(view=>({id:view.getWebContentsId?.(),url:view.getURL?.()}))})", returnByValue: true });
        if (state.result?.result?.value?.media === 3 && state.result.result.value.image > 0 && state.result.result.value.pdf > 0 && state.result.result.value.page === '1' && state.result.result.value.guests?.[0]?.id > 0 && state.result.result.value.guests[0].url?.startsWith('https:') && state.result.result.value.startup) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (state.result?.result?.value?.media !== 3 || !state.result.result.value.image || !state.result.result.value.pdf || state.result.result.value.page !== '1' || !state.result.result.value.guests?.[0]?.url?.startsWith('https:') || !state.result.result.value.startup) {
        throw new Error(`Media/startup did not initialize: ${JSON.stringify(state)} writes=${writes} errors=${errors}`);
      }
      const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
      const wait = async (expression, description) => {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if (await evaluate(expression)) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`Media check failed: ${description}; ${JSON.stringify(await evaluate("[...document.querySelectorAll('.media-status')].map(e=>e.textContent)"))}; ${errors}`);
      };
      const key = async (key, code, modifiers = 0) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
      };
      await evaluate("document.querySelector('[data-pane=aux] .xterm-helper-textarea').focus()");
      await typeKeys('portal-media ./relative.svg');
      await wait(`document.querySelector('[data-pane=media1]')?.dataset.source===${JSON.stringify(path.join(auxMediaDirectory, 'relative.svg'))}`, 'relative source uses auxiliary cwd');
      await evaluate("[...document.querySelector('[data-pane=media1] .media-toolbar').querySelectorAll('button')].find(b=>b.textContent==='CLOSE').click()");
      await wait("!document.querySelector('[data-pane=media1]')", 'relative media close');
      await evaluate("document.querySelector('[data-pane=aux] .xterm-helper-textarea').focus()");
      await typeKeys('portal-media ./missing.svg');
      await wait(`document.querySelector('#media-dialog').open && document.querySelector('#media-base-directory').textContent.includes(${JSON.stringify(auxMediaDirectory)})`, 'manual fallback retains auxiliary base directory');
      await evaluate("document.querySelector('#media-source').value='./relative.svg';document.querySelector('#media-form').requestSubmit()");
      await wait(`document.querySelector('[data-pane=media1]')?.dataset.source===${JSON.stringify(path.join(auxMediaDirectory, 'relative.svg'))}`, 'relative retry uses captured cwd');
      await evaluate("[...document.querySelector('[data-pane=media1] .media-toolbar').querySelectorAll('button')].find(b=>b.textContent==='CLOSE').click()");
      await wait("!document.querySelector('[data-pane=media1]')", 'relative retry media close');
      await evaluate("document.querySelector('[data-pane=image]').focus()");
      await key('ArrowRight', 'ArrowRight');
      await wait("document.querySelector('[data-pane=image]').dataset.source.endsWith('image10.svg')", 'next image');
      await key('ArrowLeft', 'ArrowLeft');
      await wait("document.querySelector('[data-pane=image]').dataset.source.endsWith('image2.svg')", 'previous image');
      await key('s', 'KeyS');
      await wait("document.querySelector('[data-pane=image]').dataset.sort==='modified:ascending'", 'image file ordering');
      await key('S', 'KeyS', 8);
      await wait("document.querySelector('[data-pane=image]').dataset.sort==='modified:descending'", 'reverse file ordering');
      await key('1', 'Digit1');
      await wait("parseFloat(document.querySelector('[data-pane=image] img').style.width)===document.querySelector('[data-pane=image] img').naturalWidth", 'actual image size');
      await key('F11', 'F11');
      await wait("document.querySelector('[data-pane=image]').classList.contains('pane-maximized')", 'pane maximization');
      await key('F11', 'F11');
      await evaluate("document.querySelector('[data-pane=pdf]').focus()");
      await key('ArrowDown', 'ArrowDown');
      await wait("document.querySelector('[data-pane=pdf]').dataset.page==='2'", 'PDF next page');
      await key('ArrowUp', 'ArrowUp');
      await wait("document.querySelector('[data-pane=pdf]').dataset.page==='1'", 'PDF previous page');
      await key('d', 'KeyD');
      await key('ArrowLeft', 'ArrowLeft');
      await wait("document.querySelector('[data-pane=pdf]').dataset.page==='2'", 'RTL PDF left means next');
      await key('ArrowRight', 'ArrowRight', 2);
      await wait("document.querySelector('[data-pane=pdf]').dataset.source.endsWith('sample2.pdf') && document.querySelector('[data-pane=pdf]').dataset.page==='1'", 'next PDF file');
      const addressNative = await evaluate("(()=>{const a=document.querySelector('.media-web input[type=url]');a.focus();return a.dispatchEvent(new KeyboardEvent('keydown',{key:'v',code:'KeyV',ctrlKey:true,bubbles:true,cancelable:true}))})()");
      if (!addressNative) throw new Error('Browser address clipboard shortcut was intercepted by the terminal');
      await evaluate("document.querySelector('.media-web webview').sendInputEvent({type:'keyDown',keyCode:'F11'})");
      await wait("document.querySelector('.media-web').classList.contains('pane-maximized')", 'web guest F11 maximization');
      await evaluate("document.querySelector('.media-web webview').sendInputEvent({type:'keyDown',keyCode:'F11'})");
      await wait("!document.querySelector('.media-web').classList.contains('pane-maximized')", 'web guest restore');
      await evaluate("document.querySelector('.media-web webview').sendInputEvent({type:'keyDown',keyCode:'F1'})");
      await wait("document.querySelector('#help-dialog').open", 'help from embedded browser');
      await evaluate("document.querySelector('#help-close').click()");
      await wait("!document.querySelector('#help-dialog').open", 'help close before terminal selection');
      await evaluate("document.querySelector('.media-web webview').sendInputEvent({type:'keyDown',keyCode:'1',modifiers:['control']});document.querySelector('.media-web webview').sendInputEvent({type:'keyUp',keyCode:'1',modifiers:['control']})");
      await wait("document.activeElement?.closest('[data-pane]')?.dataset.pane==='main'", 'browser-to-terminal selection');
      const recorded = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
        const context=canvas.getContext('2d'), stream=canvas.captureStream(10), chunks=[];
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
        recorder.ondataavailable=e=>chunks.push(e.data);
        const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
        for(let i=0;i<6;i++){context.fillStyle=i%2?'#ff9d20':'#050301';context.fillRect(0,0,32,32);await new Promise(r=>setTimeout(r,100));}
        recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
        return btoa(String.fromCharCode(...new Uint8Array(await new Blob(chunks).arrayBuffer())));
      })()` });
      if (!recorded.result?.result?.value) throw new Error(`Could not record synthetic test video: ${JSON.stringify(recorded)}`);
      const video = path.join(configHome, 'video1.webm');
      fs.writeFileSync(video, Buffer.from(recorded.result.result.value, 'base64'));
      fs.copyFileSync(video, path.join(configHome, 'video2.webm'));
      await evaluate("document.querySelector('[data-pane=main] .xterm-helper-textarea').focus()");
      await typeKeys(`portal-media "${video}"`);
      await wait("document.querySelector('.media-video video')?.readyState>=1", 'portal-media inferred video');
      await evaluate("document.querySelector('.media-video').focus()");
      await key('ArrowUp', 'ArrowUp');
      await wait("document.querySelector('.media-video video').volume>0.5", 'video volume');
      await key('ArrowRight', 'ArrowRight');
      await wait("document.querySelector('.media-video video').currentTime>0.05", 'video seek');
      await key('ArrowRight', 'ArrowRight', 2);
      await wait("document.querySelector('.media-video video').src.endsWith('video2.webm')", 'next video file');
      await evaluate("document.querySelector('[data-pane=main] .xterm-helper-textarea').focus()");
      await typeKeys(`portal-media "${path.join(configHome, 'unknown.extension')}"`);
      await wait("document.querySelector('#media-dialog').open && document.querySelector('#media-source').value.endsWith('unknown.extension')", 'manual kind fallback');
      await evaluate("document.querySelector('#media-cancel').click();document.querySelector('[data-pane=main] .xterm-helper-textarea').focus()");
      console.log('Image navigation/sort/zoom, PDF pages/RTL/files, video controls, inferred portal-media and manual fallback verified');
      await typeKeys('portal-preset 2x2');
      await wait("document.querySelector('#preset-dialog').open", 'close added video pane');
      await evaluate("document.querySelector('#preset-selection').value='2,6';document.querySelector('#preset-form').requestSubmit()");
      let replacement;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        replacement = await send('Runtime.evaluate', { expression: "document.querySelector('#replace-dialog').open" });
        if (replacement.result?.result?.value) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!replacement.result?.result?.value) throw new Error(`Media replacement was not confirmed: ${writes}`);
      await send('Runtime.evaluate', { expression: "document.querySelector('#replace-confirm').click()" });
      let terminals;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        terminals = await send('Runtime.evaluate', { expression: "document.querySelectorAll('#screen .terminal-pane').length" });
        if (terminals.result?.result?.value === 4) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (terminals.result?.result?.value !== 4) throw new Error(`Media replacement did not create four terminals: ${writes}`);
      console.log('GUI media panes loaded and replaced without restarting the retained PTY');
      await send('Runtime.evaluate', { expression: "document.querySelector('[data-pane=main] .xterm-helper-textarea').focus()" });
    }
    if (checkPreset && checkInvalid) {
      await typeKeys('portal-preset 5-2-3');
      if (process.argv.includes('--wait-error')) {
        let status;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          status = await send('Runtime.evaluate', { expression: "document.querySelector('#mode-indicator').textContent" });
          if (status.result?.result?.value?.startsWith('PRESET ERROR:')) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!status.result?.result?.value?.startsWith('PRESET ERROR:')) throw new Error(`Invalid preset error was not displayed: ${JSON.stringify(status)}`);
      }
      await typeKeys('portal-preset c5-2-3');
      let count = 0;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const response = await send('Runtime.evaluate', { expression: "document.querySelectorAll('#screen .terminal-pane').length" });
        count = response.result?.result?.value;
        if (count === 10) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (count !== 10) {
        const state = await send('Runtime.evaluate', { expression: "JSON.stringify({focus:document.activeElement?.closest('.pane')?.dataset.pane, input:document.activeElement?.value, areas:document.querySelector('#screen').style.gridTemplateAreas})" });
        throw new Error(`Valid preset did not work after invalid preset: ${writes} state=${JSON.stringify(state)}`);
      }
      console.log('GUI accepted a valid preset immediately after an invalid name');
    } else if (checkPreset) {
      await enter('portal-preset 2x2');
      let open = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await send('Runtime.evaluate', { expression: "document.querySelector('#preset-dialog').open" });
        open = response.result?.result?.value;
        if (open) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!open) throw new Error(`Close-window dialog did not open: ${writes}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('#preset-selection').value='${checkRegex ? '2|5' : '2,5'}'; document.querySelector('#preset-form').requestSubmit()` });
      let state;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        state = await send('Runtime.evaluate', { expression: "[...document.querySelectorAll('#screen .terminal-pane')].map(p=>p.dataset.pane).join(',')" });
        if (state.result?.result?.value === 'main,third,fourth,sixth') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (state.result?.result?.value !== 'main,third,fourth,sixth') throw new Error(`Unexpected survivor sessions: ${JSON.stringify(state)} writes=${writes}`);
      await send('Page.bringToFront');
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-preset 3x2');
      let count = 0;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await send('Runtime.evaluate', { expression: "document.querySelectorAll('#screen .terminal-pane').length" });
        count = response.result?.result?.value;
        if (count === 6) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (count !== 6) {
        const state = await send('Runtime.evaluate', { expression: "JSON.stringify({dialog:document.querySelector('#preset-dialog').open,focus:document.activeElement?.outerHTML?.slice(0,250),value:document.activeElement?.value,events:window.__exitEvents,screen:[...document.querySelectorAll('#screen .terminal-pane')].map(p=>p.dataset.pane)})" });
        throw new Error(`Preset did not grow to six panes: ${writes} state=${JSON.stringify(state)}`);
      }
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F2', code: 'F2', windowsVirtualKeyCode: 113 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F2', code: 'F2', windowsVirtualKeyCode: 113 });
      let original;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        original = await send('Runtime.evaluate', { expression: "[...document.querySelectorAll('#screen .pane')].map(p=>p.dataset.pane).join(',')" });
        if (original.result?.result?.value === 'main,aux,logo') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (original.result?.result?.value !== 'main,aux,logo') throw new Error(`Original layout did not restore closed aux pane: ${JSON.stringify(original)}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await send('Runtime.evaluate', { expression: "document.querySelectorAll('#screen .terminal-pane').length" });
        if (response.result?.result?.value === 6) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-help');
      let help;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        help = await send('Runtime.evaluate', { expression: "document.querySelector('#help-dialog').open" });
        if (help.result?.result?.value) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!help.result?.result?.value) throw new Error(`portal-help did not open: ${writes}`);
      await send('Runtime.evaluate', { expression: "document.querySelector('#help-close').click()" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-preset 5+2');
      let secondDialog = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await send('Runtime.evaluate', { expression: "document.querySelector('#preset-dialog').open" });
        secondDialog = response.result?.result?.value;
        if (secondDialog) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!secondDialog) throw new Error(`Internal command stopped after growing the preset: ${writes}`);
      await send('Runtime.evaluate', { expression: "document.querySelector('#preset-selection').value='6'; document.querySelector('#preset-form').requestSubmit()" });
      let vertical;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        vertical = await send('Runtime.evaluate', { expression: "({count:document.querySelectorAll('#screen .terminal-pane').length,rows:document.querySelector('#screen').style.gridTemplateRows})", returnByValue: true });
        if (vertical.result?.result?.value?.count === 5 && vertical.result.result.value.rows === '1fr 1fr 1fr') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (vertical.result?.result?.value?.count !== 5 || vertical.result.result.value.rows !== '1fr 1fr 1fr') throw new Error(`Vertical preset was not applied: ${JSON.stringify(vertical)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-preset -5+2');
      let bottom;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        bottom = await send('Runtime.evaluate', { expression: "document.querySelector('#screen').style.gridTemplateAreas" });
        if (bottom.result?.result?.value?.includes('session1 session1')) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!bottom.result?.result?.value?.includes('session1 session1')) throw new Error(`Bottom-light preset was not applied: ${JSON.stringify(bottom)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-preset -5-2');
      let right;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        right = await send('Runtime.evaluate', { expression: "({columns:document.querySelector('#screen').style.gridTemplateColumns,rows:document.querySelector('#screen').style.gridTemplateRows})", returnByValue: true });
        if (right.result?.result?.value?.columns === '1fr 1fr 1fr' && right.result.result.value.rows === '1fr 1fr') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (right.result?.result?.value?.columns !== '1fr 1fr 1fr') throw new Error(`Right-light preset was not applied: ${JSON.stringify(right)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-preset c1-2-1');
      let columnDialog;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        columnDialog = await send('Runtime.evaluate', { expression: "document.querySelector('#preset-dialog').open" });
        if (columnDialog.result?.result?.value) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!columnDialog.result?.result?.value) throw new Error(`Column-count preset did not prompt for a pane to close: ${writes}`);
      await send('Runtime.evaluate', { expression: "document.querySelector('#preset-selection').value='5'; document.querySelector('#preset-form').requestSubmit()" });
      let columnAreas;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        columnAreas = await send('Runtime.evaluate', { expression: "document.querySelector('#screen').style.gridTemplateAreas" });
        if (columnAreas.result?.result?.value?.includes('main third sixth') && columnAreas.result.result.value.includes('main fourth sixth')) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!columnAreas.result?.result?.value?.includes('main third sixth')) throw new Error(`c1-2-1 was not applied: ${JSON.stringify(columnAreas)}`);
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea').focus()` });
      await typeKeys('portal-preset r1-2-1');
      let rowAreas;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        rowAreas = await send('Runtime.evaluate', { expression: "document.querySelector('#screen').style.gridTemplateAreas" });
        if (rowAreas.result?.result?.value?.includes('main main') && rowAreas.result.result.value.includes('sixth sixth')) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!rowAreas.result?.result?.value?.includes('sixth sixth')) throw new Error(`r1-2-1 was not applied: ${JSON.stringify(rowAreas)}`);
      console.log('GUI preset switching preserved selected panes and added new panes');
      const refocused = await send('Runtime.evaluate', { expression: `document.querySelector('[data-pane=${sourceId}] .xterm-helper-textarea')?.focus(); document.activeElement?.closest('.pane')?.dataset.pane` });
      if (refocused.result?.result?.value !== sourceId) throw new Error(`Source pane lost focus: ${JSON.stringify(refocused)}`);
    }
    if (checkPreset || checkMedia || checkWheel || checkLayout || checkNewWindow || checkHelp || checkCrt || checkCwd) await typeKeys('portal-exit');
    else await enter('portal-exit');
    // The app may close before DevTools can acknowledge the Enter event.
    for (let attempt = 0; attempt < 80 && !exited; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 250));
    if (!exited && !writes.includes('QUIT')) {
      throw new Error(`GUI stayed open after portal-exit: ${errors} writes=${writes.slice(-3000)}`);
    }
    socket.close();
    console.log(exited ? 'GUI exited after portal-exit' : 'GUI recognized portal-exit');
  } finally {
    if (!exited) {
      child.kill();
      for (let attempt = 0; attempt < 30 && !exited; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    try { fs.rmSync(configHome, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
    catch (error) { console.error(`Could not clean GUI test directory: ${error.message}`); }
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
