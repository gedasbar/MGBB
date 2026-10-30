// Draws the home-screen icons into public/ (npm run make-icons). No dependencies: a tiny rasteriser and PNG writer.
// The mark follows the game's art language (flat fills, sharp shapes, no gradients): a grey hull arrow under two
// yellow diamonds that have just split apart (mitosis). The mark stays inside the middle 60% so a round or
// rounded-square mask on a phone never cuts it.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x1c, 0x1c, 0x1e];
const HULL = [0xd4, 0xd4, 0xd8];
const CELL = [0xf2, 0xc2, 0x30];
const SS = 4; // samples per axis for edge smoothing

// Shapes in a 0..1 square, drawn in order (later on top).
const insideTri = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const d = (x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d1 = d(ax, ay, bx, by), d2 = d(bx, by, cx, cy), d3 = d(cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const diamond = (cx, cy, r) => (x, y) => Math.abs(x - cx) + Math.abs(y - cy) <= r;
const SHAPES = [
  { color: HULL, test: (x, y) => insideTri(x, y, [0.5, 0.52], [0.3, 0.8], [0.7, 0.8]) },
  { color: CELL, test: diamond(0.37, 0.34, 0.14) },
  { color: CELL, test: diamond(0.63, 0.34, 0.14) },
];

function render(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        let c = BG;
        for (const s of SHAPES) if (s.test(u, v)) c = s.color;
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = SS * SS, o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  return raw;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bit, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(render(size), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(__dirname, '..', 'public');
fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(out, name), png(size));
  console.log(`public/${name} (${size} x ${size})`);
}
