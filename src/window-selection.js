function selectWindowNumbers(input, total, syntax = 'ranges') {
  const value = input.trim();
  if (!value) throw new Error('Enter window numbers to close');
  if (syntax === 'regex') {
    let matcher;
    try { matcher = new RegExp(`^(?:${value})$`); }
    catch { throw new Error('Invalid window number regex'); }
    return Array.from({ length: total }, (_, index) => index + 1).filter((number) => matcher.test(String(number)));
  }
  if (syntax !== 'ranges') throw new Error('Unsupported window selection syntax');
  const selected = new Set();
  for (const term of value.split(',')) {
    const token = term.trim();
    const inverted = token.startsWith('!');
    const body = inverted ? token.slice(1) : token;
    const range = /^(\d+)-(\d+)$/.exec(inverted && body.startsWith('(') && body.endsWith(')') ? body.slice(1, -1) : body);
    const single = /^(\d+)$/.exec(body);
    if (!range && !single) throw new Error(`Invalid window selection: ${token}`);
    const start = Number(range ? range[1] : single[1]);
    const end = Number(range ? range[2] : single[1]);
    if (start < 1 || end > total || start > end) throw new Error(`Window number must be between 1 and ${total}`);
    for (let number = 1; number <= total; number += 1) {
      if (inverted ? number < start || number > end : number >= start && number <= end) selected.add(number);
    }
  }
  return [...selected].sort((a, b) => a - b);
}

module.exports = { selectWindowNumbers };
