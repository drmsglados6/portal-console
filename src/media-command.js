const KINDS = ['image', 'pdf', 'video', 'web'];
const EXTENSIONS = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico', '.tif', '.tiff'],
  pdf: ['.pdf'],
  video: ['.mp4', '.m4v', '.webm', '.ogv', '.ogg', '.mov', '.mkv']
};

function inferMediaKind(source) {
  if (/^https?:\/\//i.test(source)) return 'web';
  let file = source;
  if (source.startsWith('file:')) file = decodeURIComponent(new URL(source).pathname);
  const extension = /\.[^./\\]+$/.exec(file)?.[0].toLowerCase();
  const kind = Object.keys(EXTENSIONS).find((candidate) => EXTENSIONS[candidate].includes(extension));
  if (!kind) throw new Error('Unknown source type. Specify --kind image|pdf|video|web.');
  return kind;
}

function parseMediaCommand(line) {
  const words = [];
  let word = '', quote = '', started = false;
  for (const character of line) {
    if (quote) {
      if (character === quote) quote = '';
      else word += character;
    } else if (character === '"' || character === "'") { quote = character; started = true; }
    else if (/\s/.test(character)) {
      if (started) words.push(word);
      word = ''; started = false;
    } else { word += character; started = true; }
  }
  if (quote) throw new Error('Close the quoted source path/URL.');
  if (started) words.push(word);
  if (words.shift() !== 'portal-media') throw new Error('Invalid media command');
  const request = {};
  const fail = (message) => { const error = new Error(message); error.source = request.source; throw error; };
  while (words.length) {
    const flag = words.shift();
    if (!flag.startsWith('--') && !Object.hasOwn(request, 'source')) { request.source = flag; continue; }
    const match = /^--(kind|source)(?:=(.*))?$/.exec(flag);
    if (!match || Object.hasOwn(request, match[1])) fail('Use one source and an optional --kind override.');
    const value = match[2] === undefined ? words.shift() : match[2];
    if (!value || value.startsWith('--')) fail(`Missing value for --${match[1]}`);
    request[match[1]] = value;
  }
  if (!request.source?.trim() && (!request.kind || KINDS.includes(request.kind))) return { kind: request.kind || 'auto', source: '' };
  if (request.kind === undefined) {
    try { request.kind = inferMediaKind(request.source); }
    catch (error) { error.source = request.source; throw error; }
  }
  if (!KINDS.includes(request.kind)) fail('Kind must be image, pdf, video or web.');
  return request;
}

function appendMediaPane(layout, request, existingIds = []) {
  const taken = new Set([...layout.panes.map((pane) => pane.id), ...existingIds]);
  let number = 1;
  while (taken.has(`media${number}`)) number += 1;
  const id = `media${number}`;
  return {
    ...layout,
    columns: [...layout.columns, '1fr'],
    areas: layout.areas.map((row) => `${row} ${id}`),
    panes: [...layout.panes, { id, title: request.kind.toUpperCase(), kind: request.kind, source: request.source }]
  };
}

function removeMediaPane(layout, id) {
  const panes = layout.panes.filter((pane) => pane.id !== id);
  if (!panes.length) throw new Error('Keep at least one visible pane, or switch to original mode.');
  const grid = layout.areas.map((row) => row.trim().split(/\s+/).map((cell) => cell === id ? '.' : cell));
  const columns = layout.columns.map((_, index) => index).filter((index) => grid.some((row) => row[index] !== '.'));
  const rows = grid.map((_, index) => index).filter((index) => columns.some((column) => grid[index][column] !== '.'));
  return { ...layout, panes, columns: columns.map((index) => layout.columns[index]), rows: rows.map((index) => layout.rows[index]),
    areas: rows.map((index) => columns.map((column) => grid[index][column]).join(' ')) };
}

module.exports = { KINDS, EXTENSIONS, inferMediaKind, parseMediaCommand, appendMediaPane, removeMediaPane };
