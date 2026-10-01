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
  const sourceId = process.argv.includes('--third') ? 'third' : 'main';
  const port = await availablePort();
  const electron = require('electron');
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-gui-check-'));
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
  if (checkMedia) {
    const pdf = path.join(configHome, 'sample.pdf');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream'
    ];
    let contents = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(contents));
      contents += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(contents);
    contents += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    fs.writeFileSync(pdf, contents);
    const folder = path.join(configHome, 'portal-console');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'config.json'), JSON.stringify({
      mode: 'modern', fullscreen: false, modern: {
        columns: ['1fr', '1fr'], rows: ['1fr', '1fr'], areas: ['main image', 'pdf web'], panes: [
          { id: 'main', kind: 'terminal', title: 'MAIN', startupCommand: 'echo __PORTAL_STARTUP__', appearance: { fontSize: 18, foreground: '#00ff00', background: '#111111' } },
          { id: 'image', kind: 'image', title: 'IMAGE', source: path.join(__dirname, '..', 'assets', 'aperture-science.svg') },
          { id: 'pdf', kind: 'pdf', title: 'PDF', source: pdf },
          { id: 'web', kind: 'web', title: 'WEB', source: 'https://example.com/' }
        ]
      }
    }));
  }
  fs.writeFileSync(path.join(configHome, 'package.json'), JSON.stringify({ name: 'portal-gui-exit-check', main: 'main.js' }));
  const mockWindowLaunch = checkNewWindow ? "const cp=require('node:child_process'),realSpawn=cp.spawn; cp.spawn=function(file,args,options){if(file===process.execPath&&options?.detached){process.stdout.write('NEW_WINDOW_SPAWN '+JSON.stringify(args)+'\\n');return {pid:12345,on(){return this},unref(){}};}return realSpawn.apply(this,arguments)};" : '';
  fs.writeFileSync(path.join(configHome, 'main.js'), `${mockWindowLaunch} const {ipcMain,BrowserWindow}=require('electron'); ipcMain.on('terminal:write',(_event,value)=>process.stdout.write('WRITE '+JSON.stringify(value)+'\\n')); ipcMain.on('app:quit',()=>process.stdout.write('QUIT\\n')); require(${JSON.stringify(path.join(__dirname, '..', 'src', 'main.js'))}); ${checkWheel ? "setTimeout(()=>BrowserWindow.getAllWindows()[0]?.webContents.send('terminal:data',{id:'main',data:'\\x1b[?1000h\\x1b[?1006h',generation:1}),4000);" : ''}\n`);
  const child = spawn(electron, [configHome, '--windowed', ...(checkPreset ? ['--preset', '3x2'] : []), `--remote-debugging-port=${port}`], {
    stdio: 'pipe', env: { ...process.env, APPDATA: configHome, XDG_CONFIG_HOME: configHome }
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
        state = await send('Runtime.evaluate', { expression: "({media:document.querySelectorAll('#screen .media-pane').length, image:document.querySelector('.media-host img')?.naturalWidth, guests:[...document.querySelectorAll('#screen webview')].map(view=>({id:view.getWebContentsId?.(),url:view.getURL?.()}))})", returnByValue: true });
        if (state.result?.result?.value?.media === 3 && state.result.result.value.image > 0 && state.result.result.value.guests?.[0]?.id > 0 && state.result.result.value.guests[0].url?.startsWith('file:') && state.result.result.value.guests[1]?.id > 0 && state.result.result.value.guests[1].url?.startsWith('https:') && writes.includes('__PORTAL_STARTUP__')) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (state.result?.result?.value?.media !== 3 || !state.result.result.value.image || !state.result.result.value.guests?.[0]?.url?.startsWith('file:') || !state.result.result.value.guests?.[1]?.url?.startsWith('https:') || !writes.includes('__PORTAL_STARTUP__')) {
        throw new Error(`Media/startup did not initialize: ${JSON.stringify(state)} writes=${writes} errors=${errors}`);
      }
      await typeKeys('portal-preset 2x2');
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
    if (checkPreset || checkMedia || checkWheel || checkLayout || checkNewWindow) await typeKeys('portal-exit');
    else await enter('portal-exit');
    // The app may close before DevTools can acknowledge the Enter event.
    for (let attempt = 0; attempt < 80 && !exited; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 250));
    if (!exited && !writes.includes('QUIT')) {
      throw new Error(`GUI stayed open after portal-exit: ${errors} writes=${writes.slice(-3000)}`);
    }
    socket.close();
    console.log(exited ? 'GUI exited after portal-exit' : 'GUI recognized portal-exit');
  } finally {
    if (!exited) child.kill();
    fs.rmSync(configHome, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
