# Portal Console Handoff

## Current State

- Version: `0.1.0`
- Runtime: Electron 43, xterm.js 6, node-pty 1.1
- Executable name: `portal-console` (`portal-console.exe` on Windows)
- GUI modes: fixed 4:3 `original`, configurable full-screen `modern`
- Headless mode: ANSI multiplexer with automatic Linux fallback when no display is available
- Ending mode: command mode `e`; reads Portal 1 credits and audio directly from a local Steam VPK
- Default Windows shell: Windows PowerShell
- Ending audio defaults: volume `0.1`, quadratic curve, 200 Hz low shelf `-8 dB`, compressor disabled
- Windows installer bundle: `release-current/installer/`

Original Portal lyrics, credits, ASCII art, and audio are not stored in this project or installer. `vpk-tools` reads them into memory from an installed copy of Portal.

## Commands

```sh
npm ci
npm test
npm run build
npm start
npm run headless
npm run dist
```

Windows installer:

```powershell
npm run installer:win
```

## Ubuntu Prerequisites

Use Ubuntu 22.04 or newer with Node.js 22 LTS or newer.

```sh
sudo apt update
sudo apt install -y \
  build-essential python3 make g++ pkg-config git \
  dpkg fakeroot rpm \
  libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 \
  libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxrandr2 libpangocairo-1.0-0 libcups2
```

On Ubuntu 24.04, `libasound2t64` may be selected instead of `libasound2`.

## Ubuntu Clean Install

Do not reuse the copied Windows `node_modules`; it contains Windows native binaries.

```sh
rm -rf node_modules dist release release-current release-safe release-ending
npm ci
npm test
npm run build
```

`node-pty@1.1.0` has no Linux prebuild in the current npm package. `npm ci` therefore needs Python 3, make, GCC/G++, and development headers. Confirm native dependencies with:

```sh
node -e "const pty=require('node-pty'); const p=pty.spawn(process.env.SHELL || '/bin/sh', ['-c', 'printf pty-ok'], {cols:80, rows:24}); p.onData(d=>process.stdout.write(d)); p.onExit(()=>process.exit());"
node -e "require('sharp')({create:{width:1,height:1,channels:4,background:'#000'}}).png().toBuffer().then(()=>console.log('sharp-ok'))"
```

## Ubuntu GUI Check

```sh
npm start -- --mode original --windowed
```

Check the following:

- `$SHELL` starts instead of a Windows profile.
- `F3`, then `F2`, restores the original grid.
- `Ctrl+Shift+P`, then `r`, restarts the focused PTY.
- `Ctrl+Shift+P`, then `e`, starts ending playback.
- A Steam Portal install is found through `libraryfolders.vdf` when present.
- Clipboard shortcuts work under X11 and Wayland.
- `Alt+F4` and emergency `Ctrl+Alt+Shift+Q` close the app.

Display-less check:

```sh
TERM=xterm-256color npm run headless
```

Headless mode requires an interactive TTY and intentionally fails when stdin/stdout are pipes.

## Ubuntu Packaging Check

Build on Ubuntu itself because native modules and package tooling are platform-specific.

```sh
npm run dist
```

Expected under `release/`:

- AppImage
- Debian package (`.deb`)

Verify the unpacked app and Debian package:

```sh
./release/linux-unpacked/portal-console --windowed
sudo apt install ./release/*.deb
portal-console --windowed
```

If node-pty fails only in the packaged app, inspect `resources/app.asar.unpacked/node_modules/node-pty`. The project sets `npmRebuild: false` because Windows Electron rebuild requires unavailable Spectre libraries. Revisit this on Ubuntu only if the clean source build does not load in Electron.

## Known Risks

- This workspace is managed with Git. The GitHub repository is `drmsglados6/portal-console` (private).
- Hardware acceleration defaults off after a reported full-machine freeze. Software mode disables scanlines and cursor blink.
- Portal ending audio has unusually strong bass around the chorus; current defaults use quadratic volume and a `-8 dB` 200 Hz low shelf.
- Each app window runs in its own Electron process with independent PTY sessions; use + WINDOW or Ctrl+Shift+N to launch another.
- Windows x64, Ubuntu x64, and macOS x64/arm64 packages were built on their respective GitHub-hosted runners. Packaged Electron successfully loaded sharp and launched a PTY on each platform. Interactive GUI checks on user machines remain to be done.
- Application icons and code signing are not configured.
- Diagnostics normally go to `%APPDATA%\portal-console\logs\diagnostics.log` or `PORTAL_CONSOLE_LOG_DIR`.

## Important Files

- `.github/workflows/build.yml`: cross-platform builds, artifacts, and tagged releases
- `scripts/check-packaged.js`: native dependency smoke check with packaged Electron
- `TODO.md`: remaining work, including Ctrl+C reproduction and other-session integration

- `README.md`: user-facing setup and controls
- `portal-console.example.json`: configuration example
- `assets/ending-scene.json`: copyright-safe demo scene schema
- `src/portal-import.js`: Steam/VPK discovery and Portal credits conversion
- `src/ending-state.js`: deterministic timeline state
- `src/renderer/renderer.js`: GUI and ending playback
- `src/headless.js`: ANSI frontend

## CI Verification (2026-10-01)

All four build jobs passed: <https://github.com/drmsglados6/portal-console/actions/runs/36815360458>.
Artifacts are retained for 14 days. Main/PR builds skip documentation-only changes; manual runs remain available. Tag pushes matching `v*` also publish a GitHub Release after all builds pass; that release step has not yet been exercised with a tag.

Linux packaging now supplies Debian maintainer/homepage metadata and unpacks `@img` native libraries so libvips is available outside ASAR.
