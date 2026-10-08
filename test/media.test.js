const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseMediaCommand, appendMediaPane, removeMediaPane } = require('../src/media-command');
const { resolveMedia, normalizeSource } = require('../src/media');
const { portalCommandInput } = require('../src/portal-command');
const { DEFAULT_CONFIG, validate } = require('../src/config');

test('media source inference and explicit override preserve quoted Windows paths', () => {
  assert.deepEqual(parseMediaCommand('portal-media "C:\\my pictures\\image 2.PNG"'), { source: 'C:\\my pictures\\image 2.PNG', kind: 'image' });
  assert.deepEqual(parseMediaCommand('portal-media --source="/tmp/book.PDF"'), { source: '/tmp/book.PDF', kind: 'pdf' });
  assert.equal(parseMediaCommand('portal-media https://example.com/book.pdf').kind, 'web');
  assert.equal(parseMediaCommand('portal-media https://example.com/book.pdf --kind pdf').kind, 'pdf');
  assert.equal(parseMediaCommand('portal-media movie.webm').kind, 'video');
  assert.deepEqual(parseMediaCommand('portal-media'), { source: '', kind: 'auto' });
  assert.equal(portalCommandInput()('portal-media unknown.ext\r').source, 'unknown.ext');
  assert.throws(() => parseMediaCommand('portal-media x.pdf --kind image --kind pdf'), /once|one source/);
  assert.equal(portalCommandInput()('echo portal-media x.pdf\r'), null);
  assert.deepEqual(portalCommandInput()('\x1b[200~portal-media "book.pdf"\x1b[201~\r'), { type: 'media', source: 'book.pdf', kind: 'pdf' });
});

test('local navigation filters file kinds, sorts naturally and preserves selected index', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-media-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, size] of [['image10.jpg', 10], ['image2.png', 2], ['book.pdf', 1], ['video.mp4', 1]]) fs.writeFileSync(path.join(directory, name), Buffer.alloc(size));
  const source = path.join(directory, 'image2.png');
  assert.deepEqual(resolveMedia('image', source).files.map((file) => path.basename(file)), ['image2.png', 'image10.jpg']);
  const reverse = resolveMedia('image', source, 'size', true);
  assert.equal(reverse.index, 1);
  assert.equal(path.basename(reverse.files[0]), 'image10.jpg');
  assert.equal(resolveMedia('pdf', path.join(directory, 'book.pdf')).files.length, 1);
  assert.equal(normalizeSource('video', 'https://example.com/movie').remote, true);
  assert.throws(() => normalizeSource('web', source), /http/);
  assert.throws(() => normalizeSource('pdf', 'javascript:alert(1)'), /supported/);
});

test('opening media appends a spanning pane without replacing terminal ids', () => {
  const layout = appendMediaPane(DEFAULT_CONFIG.modern, { kind: 'video', source: 'movie.mp4' }, ['media1']);
  assert.deepEqual(layout.panes.slice(0, 3), DEFAULT_CONFIG.modern.panes);
  assert.equal(layout.panes.at(-1).id, 'media2');
  assert.ok(layout.areas.every((row) => row.endsWith('media2')));
  assert.deepEqual(removeMediaPane(layout, 'media2'), DEFAULT_CONFIG.modern);
  validate({ ...DEFAULT_CONFIG, mode: 'modern', modern: layout });
  assert.throws(() => validate({ ...DEFAULT_CONFIG, media: { ...DEFAULT_CONFIG.media, pdfArrowDirection: 'invalid' } }), /pdfArrowDirection/);
});
