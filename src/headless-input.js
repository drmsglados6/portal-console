// stdin may coalesce Ctrl+B and its following key or split them across chunks.
function headlessInput() {
  let prefix = false;
  return (data) => {
    const tokens = [];
    let text = '';
    const flush = () => { if (text) tokens.push({ type: 'data', data: text }); text = ''; };
    for (const character of data) {
      if (prefix) {
        flush();
        tokens.push({ type: 'prefix', key: character });
        prefix = false;
      } else if (character === '\x02') {
        flush();
        prefix = true;
      } else text += character;
    }
    flush();
    return tokens;
  };
}
module.exports = { headlessInput };
