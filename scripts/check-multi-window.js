const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function pages(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(JSON.parse(data).filter((target) => target.type === 'page' && target.url.includes('index.html'))));
    }).on('error', reject);
  });
}

async function run() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-two-windows-'));
  fs.writeFileSync(path.join(home, 'package.json'), JSON.stringify({ name: 'portal-two-windows', main: 'main.js' }));
  fs.writeFileSync(path.join(home, 'main.js'), `require(${JSON.stringify(path.join(__dirname, '..', 'src', 'main.js'))});\n`);
  const electron = require('electron');
  const processes = [];
  try {
    for (let i = 0; i < 2; i += 1) {
      const port = await freePort();
      const child = spawn(electron, [home, '--windowed', `--remote-debugging-port=${port}`], {
        stdio: 'ignore', env: { ...process.env, APPDATA: home }
      });
      processes.push({ child, port });
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await Promise.all(processes.map(async ({ port }) => {
        try { return (await pages(port)).length > 0; } catch { return false; }
      }));
      if (ready.every(Boolean) && processes.every(({ child }) => child.exitCode === null)) {
        console.log('Two independent Portal Console windows are running');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Could not keep two Portal Console windows open simultaneously');
  } finally {
    await Promise.all(processes.map(({ child }) => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill();
    })));
    fs.rmSync(home, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
