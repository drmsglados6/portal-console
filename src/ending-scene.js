const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SCENE = path.join(__dirname, '../assets/ending-scene.json');
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function finiteTime(value, label, durationMs) {
  if (!Number.isFinite(value) || value < 0 || value > durationMs) throw new Error(`${label} is outside the scene duration`);
  return value;
}

function safeText(value, label, maximum = 65536) {
  if (typeof value !== 'string' || value.length > maximum || /[\0\x01-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new Error(`${label} contains invalid text`);
  }
  return value;
}

function validateScene(scene) {
  if (!scene || scene.version !== 1) throw new Error('ending scene version must be 1');
  if (!Number.isFinite(scene.durationMs) || scene.durationMs < 1000 || scene.durationMs > 30 * 60 * 1000) {
    throw new Error('ending scene duration must be between 1 second and 30 minutes');
  }
  const durationMs = scene.durationMs;
  const color = scene.color === undefined ? '#ffb600' : safeText(scene.color, 'scene color', 20);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('ending scene color must be a six-digit hex color');
  const audioStartMs = scene.audioStartMs === undefined ? null : finiteTime(scene.audioStartMs, 'audioStartMs', durationMs);
  const frames = {};
  const frameEntries = Object.entries(scene.frames || {});
  if (frameEntries.length > 256) throw new Error('ending scene has too many frames');
  for (const [id, value] of frameEntries) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) throw new Error(`invalid ending frame id: ${id}`);
    frames[id] = safeText(value, `frame ${id}`);
  }
  if (!Array.isArray(scene.left) || !Array.isArray(scene.credits) || !Array.isArray(scene.art)) {
    throw new Error('ending scene requires left, credits, and art arrays');
  }
  if (scene.left.length + scene.credits.length + scene.art.length > 10000) throw new Error('ending scene has too many events');
  const left = scene.left.map((event, index) => {
    const at = finiteTime(event.at, `left event ${index}.at`, durationMs);
    if (event.type === 'clear') return { type: 'clear', at };
    if (event.type !== 'type') throw new Error(`unsupported left event type: ${event.type}`);
    const duration = finiteTime(event.durationMs, `left event ${index}.durationMs`, durationMs);
    if (at + duration > durationMs) throw new Error(`left event ${index} ends outside the scene duration`);
    return { type: 'type', at, durationMs: duration, text: safeText(event.text, `left event ${index}.text`) };
  }).sort((a, b) => a.at - b.at);
  const credits = scene.credits.map((event, index) => {
    const at = finiteTime(event.at, `credit ${index}.at`, durationMs);
    const duration = finiteTime(event.durationMs, `credit ${index}.durationMs`, durationMs);
    if (at + duration > durationMs) throw new Error(`credit ${index} ends outside the scene duration`);
    return { at, durationMs: duration, text: safeText(event.text, `credit ${index}.text`, 4096) };
  }).sort((a, b) => a.at - b.at);
  const art = scene.art.map((event, index) => {
    const frame = safeText(event.frame, `art event ${index}.frame`, 40);
    if (frame !== '$logo' && !(frame in frames)) throw new Error(`unknown ending frame: ${frame}`);
    return { at: finiteTime(event.at, `art event ${index}.at`, durationMs), frame };
  }).sort((a, b) => a.at - b.at);
  return { version: 1, title: safeText(scene.title || 'ENDING PLAYBACK', 'scene title', 200), color, durationMs, audioStartMs, frames, left, credits, art };
}

function loadScene(source) {
  const file = source ? path.resolve(source) : DEFAULT_SCENE;
  const stats = fs.statSync(file);
  if (stats.size > MAX_FILE_SIZE) throw new Error('ending scene exceeds 2 MiB');
  return validateScene(JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = { DEFAULT_SCENE, loadScene, validateScene };
