const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScene, validateScene } = require('../src/ending-scene');
const { prepareScene, sceneState } = require('../src/ending-state');
const { findPortalPath, importPortalCredits, parseVdf } = require('../src/portal-import');

test('VDF parser preserves duplicate ordered entries', () => {
  const parsed = parseVdf('"root" { "line" "one" "line" "two" }');
  assert.deepEqual(parsed[0].value.map((entry) => entry.value), ['one', 'two']);
});

test('ending state is deterministic at an absolute timestamp', () => {
  const scene = prepareScene(loadScene());
  const first = sceneState(scene, 12000);
  const second = sceneState(scene, 12000);
  assert.deepEqual(first, second);
  assert.ok(first.left.length > 0);
  assert.ok(first.credits.length > 0);
});

test('scene validation rejects art references that do not exist', () => {
  assert.throws(() => validateScene({
    version: 1, durationMs: 1000, left: [], credits: [], frames: {}, art: [{ at: 0, frame: 'missing' }]
  }), /unknown ending frame/);
});

let localPortal;
try { localPortal = findPortalPath(); } catch {}
test('installed Portal assets produce a complete local scene', { skip: !localPortal }, () => {
  assert.ok(fs.existsSync(localPortal.vpk));
  const imported = importPortalCredits({ portalPath: localPortal.root, playAudio: true });
  assert.equal(imported.source, 'portal');
  assert.ok(imported.scene.left.length > 100);
  assert.ok(imported.scene.credits.length > 200);
  assert.ok(Object.keys(imported.scene.frames).length > 10);
  assert.equal(imported.scene.art[0].at, 0);
  assert.equal(imported.scene.frames[imported.scene.art[0].frame].split('\n').length, 20);
  assert.ok(imported.audio.length > 1024 * 1024);
});
