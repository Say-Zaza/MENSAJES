// Pure Node.js PNG generator - no dependencies
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    table[n] = v;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

function generatePNG(size, bgColor, drawFn) {
  const pixels = Buffer.alloc(size * size * 4);
  drawFn(pixels, size, bgColor);

  // PNG header
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT - raw data with filter byte 0 per row
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    header,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', iend)
  ]);
}

function drawHeart(pixels, size, bgColor) {
  const cx = size / 2;
  const cy = size / 2;
  const heartSize = size * 0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Rounded rect background
      const r = size * 0.18;
      const inRect = (x >= r || y >= r) && (x <= size - r || y >= r) && (x >= r || y <= size - r) && (x <= size - r || y <= size - r);
      const inCorners = (
        (x < r && y < r && Math.hypot(x - r, y - r) > r) ||
        (x > size - r && y < r && Math.hypot(x - (size - r), y - r) > r) ||
        (x < r && y > size - r && Math.hypot(x - r, y - (size - r)) > r) ||
        (x > size - r && y > size - r && Math.hypot(x - (size - r), y - (size - r)) > r)
      );

      if (!inRect || inCorners) {
        pixels[idx] = bgColor[0]; pixels[idx+1] = bgColor[1]; pixels[idx+2] = bgColor[2]; pixels[idx+3] = 255;
        continue;
      }

      // Simple heart shape using math
      const nx = (x - cx) / heartSize;
      const ny = -(y - cy) / heartSize;
      const heartEq = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;

      if (heartEq <= 0) {
        pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 255;
      } else {
        pixels[idx] = bgColor[0]; pixels[idx+1] = bgColor[1]; pixels[idx+2] = bgColor[2]; pixels[idx+3] = 255;
      }
    }
  }
}

function drawMaskable(pixels, size, bgColor) {
  const cx = size / 2;
  const cy = size / 2;
  const heartSize = size * 0.28;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Full background
      pixels[idx] = bgColor[0]; pixels[idx+1] = bgColor[1]; pixels[idx+2] = bgColor[2]; pixels[idx+3] = 255;

      const nx = (x - cx) / heartSize;
      const ny = -(y - cy) / heartSize;
      const heartEq = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;

      if (heartEq <= 0) {
        pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 255;
      }
    }
  }
}

const bg = [37, 99, 235]; // #2563eb

const icon192 = generatePNG(192, bg, drawHeart);
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), icon192);
console.log('Generated icon-192.png (' + icon192.length + ' bytes)');

const icon512 = generatePNG(512, bg, drawHeart);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), icon512);
console.log('Generated icon-512.png (' + icon512.length + ' bytes)');

const iconMaskable = generatePNG(512, bg, drawMaskable);
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-512.png'), iconMaskable);
console.log('Generated icon-maskable-512.png (' + iconMaskable.length + ' bytes)');

console.log('Done! All icons generated.');
