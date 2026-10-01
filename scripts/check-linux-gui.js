const { spawn } = require('node:child_process');
const path = require('node:path');

const child = spawn(path.resolve('release/linux-unpacked/portal-console'), [
  '--windowed', '--mode', 'modern', '--remote-debugging-port=9223'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let errors = '';
child.stderr.on('data', (data) => { errors += data; });
const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check() {
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`GUI exited early: ${errors}`);
    try {
      const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
      page = pages.find((candidate) => candidate.type === 'page');
      if (page) break;
    } catch {}
    await delay(100);
  }
  if (!page) throw new Error(`GUI debugging endpoint unavailable: ${errors}`);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  function evaluate(expression) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('GUI evaluation timed out')); }, 5000);
      const listener = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timer);
        socket.removeEventListener('message', listener);
        if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      };
      socket.addEventListener('message', listener);
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      ready = await evaluate('document.querySelectorAll(".terminal-pane .xterm").length >= 3 && document.querySelector(".screen.modern") !== null');
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error(`GUI terminals did not initialize: ${errors}`);
    await delay(500);
    if (/GLib-GObject:.*assertion/.test(errors)) throw new Error(`GTK assertion during GUI startup: ${errors}`);
    await evaluate('window.portalConsole.quit(); true');
    const code = await Promise.race([exited, delay(10000).then(() => { throw new Error('GUI did not close'); })]);
    if (code !== 0) throw new Error(`GUI exit code: ${code}; ${errors}`);
    console.log('Ubuntu GUI initialized three terminal panes and closed cleanly');
  } finally {
    socket.close();
  }
}
check().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (child.exitCode === null) child.kill();
});
