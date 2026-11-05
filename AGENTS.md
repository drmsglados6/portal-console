# Agent onboarding

Portal Console is a cross-platform terminal application. The current implementation is Electron/JavaScript; the user wants preparation for a Rust/native rewrite around 0.2.0.

## Read first

1. `HANDOFF.md` — current source/release state, verification links, operational details. Its top section is authoritative; lower release sections describe history.
2. `DEVELOPMENT_CONTEXT.md` — user intent, previous decisions, corrected assumptions and known machine-specific issues.
3. `README.md` — supported behavior, CLI, settings, installation and update instructions.
4. `NATIVE_REWRITE_0_2_0.md` — native rewrite requirements, compatibility contract, migration hazards and acceptance criteria.
5. `TODO.md` and `WINDOW_MANAGER_PLAN.md` — outstanding work and longer-term pane/window design.

## Important constraints

- Preserve running user PTYs and investigate unfamiliar changes. Test in isolated windows/install directories; never terminate the user's existing windows as routine verification.
- GitHub `drmsglados6/portal-console` is public. Confirm current visibility rather than relying on historical private-repository notes.
- CRT effects are temporarily disabled, including for saved `enabled: true`. Keep the implementation/preferences; do not turn them back on without a new user request.
- GPU acceleration is disabled by default after machine-freeze reports. Measure performance and test software rendering before changing this policy.
- Keep `pconsole`, `phelp`, `ppreset`, `prestart`, `pmedia`, `pexit`, `pupdate` and corresponding `portal-*` internal names compatible. Internal commands are handled inside the app, not installed as global shell commands.
- Preserve installer method, install location, settings, presets and logs during updates. Do not mix Windows NSIS/simple installers or Linux deb/AppImage installs.
- Public-release downloads must be matched to OS/architecture/method and size/SHA-256 verified before installation. Network/check failures must not stop terminal sessions.
- Numeric `-n` versions are distribution revisions (`0.1.8 < 0.1.8-1 < 0.1.8-2 < 0.1.9`), not SemVer prerelease ordering. Revision releases use latest=false for old-client compatibility; revision-aware updaters use the release list. Keep this distinction in Rust migration.
- Ad-hoc macOS signature integrity is not Developer ID trust/notarization. Distinguish CI success from downloaded-app Gatekeeper behavior and actual-machine fixes.
- Original Portal lyrics, credits, AA and audio are read from a local Steam installation. Do not commit those copyrighted assets, personal media, diagnostic logs or credentials.
- Do not copy Windows `node_modules` to Unix. Install dependencies natively on each target OS.
- Commit/push/tag/release only when requested. Inspect status, diff and recent commits before committing, stage intended paths and avoid amending published history.

## Main code map

| Area | Files |
| --- | --- |
| Electron lifecycle / PTY / IPC | `src/main.js`, `src/preload.js` |
| GUI panes, focus, F4, shortcuts | `src/renderer/renderer.js`, `styles.css`, `index.html` |
| Terminal input / mouse / wheel | `src/portal-command.js`, `mouse-input.js`, `wheel-scroll.js` |
| TTY frontend | `src/headless.js`, `headless-input.js`, `headless-entry.js` |
| Config / presets / CWD / shells | `src/config.js`, `preset-switch.js`, `window-selection.js`, `cwd.js`, `shell.js` |
| Media / PDF / embedded web | `src/media-command.js`, `media.js`, `src/renderer/media-view.js` |
| Updates and one-time migration | `src/updater.js`, `update-runner.*`, `update-once.js`, `installer/update-once.*` |
| Install metadata / CLI registration | `src/installation.js`, `install-record-cli.js`, `cli-alias.js`, `register-cli.js` |
| Build, packaging, CI | `scripts/build.js`, `after-pack.js`, `after-all-artifact-build.js`, `installer/`, `.github/workflows/build.yml` |

## Verification

Use relevant checks rather than repeatedly running unrelated suites. In Windows PowerShell 5.1, prefer `npm.cmd` for reliable forwarding of `--` arguments; `&&` is not supported in that shell.

```powershell
npm.cmd test
npm.cmd run build
node scripts/check-gui-exit.js --crt --help --cwd
node scripts/check-gui-exit.js --media
node scripts/check-gui-exit.js --preset
node scripts/check-windows-update.js
```

`--cwd` currently contains PowerShell-specific assertions; the Windows CRT/help/CWD combination is used in CI. Do not combine `--preset` and `--media`: the preset startup override replaces the media fixture. The GUI harness creates separate windows/config directories. `--crt` now verifies that CRT stays suspended even with a saved enabled=true setting.

For packaged checks, build the relevant platform first, then run `node scripts/check-packaged.js`; `--media --packaged` covers shipped media assets. `scripts/check-nsis-update.ps1` installs a real temporary NSIS application and touches that application's registration: use its isolated CI runner, not the user's workstation installation. Linux `scripts/check-headless.py` exercises a real TTY and mocked update statuses. The workflow covers Windows x64, Linux x64, Ubuntu 24.04 GUI/TTY, Mac Intel and ARM64, signatures, installer updates and legacy deb upgrades.

When finishing, record actual CI/release links and unresolved real-machine checks in `HANDOFF.md`; distinguish implemented, locally tested, CI-verified and released states.
