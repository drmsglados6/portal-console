const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ outDir }) => {
  const root = path.join(__dirname, '..');
  const sources = ['dist/update-once.cjs', 'installer/update-once.ps1', 'installer/update-once.sh'];
  return sources.map((source) => {
    const destination = path.join(outDir, path.basename(source));
    fs.copyFileSync(path.join(root, source), destination);
    return destination;
  });
};
