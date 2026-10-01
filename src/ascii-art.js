const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const DEFAULT_LOGO = path.join(__dirname, '../assets/aperture-science.svg');

async function imageToAscii(options, columns, rows) {
  const source = options.source ? path.resolve(options.source) : DEFAULT_LOGO;
  const width = Math.max(8, Math.min(160, Math.floor(columns)));
  const height = Math.max(4, Math.min(80, Math.floor(rows)));
  const characters = [...options.characters];
  // Electron's fs can read from app.asar, while native image libraries cannot
  // reliably open an ASAR virtual path themselves.
  const input = await fs.readFile(source);
  const metadata = await sharp(input).metadata();
  const sourceAspect = metadata.width / metadata.height;
  const characterAspect = options.characterAspectRatio || 0.6;
  const characterGridAspect = sourceAspect / characterAspect;
  let contentWidth;
  let contentHeight;
  if (width / height > characterGridAspect) {
    contentHeight = height;
    contentWidth = Math.max(1, Math.round(contentHeight * characterGridAspect));
  } else {
    contentWidth = width;
    contentHeight = Math.max(1, Math.round(contentWidth / characterGridAspect));
  }
  const { data, info } = await sharp(input)
    .flatten({ background: '#000000' })
    .resize(contentWidth, contentHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lines = [];
  const offsetX = Math.floor((width - info.width) / 2);
  const offsetY = Math.floor((height - info.height) / 2);
  for (let y = 0; y < height; y += 1) {
    let line = '';
    for (let x = 0; x < width; x += 1) {
      const imageX = x - offsetX;
      const imageY = y - offsetY;
      if (imageX < 0 || imageY < 0 || imageX >= info.width || imageY >= info.height) {
        line += characters[0];
        continue;
      }
      let value = data[imageY * info.width + imageX] / 255;
      if (options.invert) value = 1 - value;
      line += characters[Math.round(value * (characters.length - 1))];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n').replace(/\s+$/, '');
}

module.exports = { DEFAULT_LOGO, imageToAscii };
