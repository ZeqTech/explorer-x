// Generates app-icon.png (1024x1024): a blue rounded square with a white folder.
// Usage: node scripts/make-icon.js <out.png>      then: npx tauri icon <out.png>
const fs = require('fs');
const zlib = require('zlib');

const N = 1024;
const buf = Buffer.alloc(N * N * 4);

// signed distance to a rounded rectangle centered at (cx, cy)
const rrect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - (hw - r), dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const A = [0, 103, 192], B = [76, 194, 255];

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    const bg = rrect(x, y, N / 2, N / 2, N / 2 - 24, N / 2 - 24, 210);
    let px = [0, 0, 0, 0];
    if (bg < 1) {
      const t = (x + y) / (2 * N);
      px = [...mix(A, B, t), Math.round(255 * Math.min(1, Math.max(0, 1 - bg)))];
      // folder: tab + body
      const tab = rrect(x, y, 370, 330, 150, 60, 40);
      const body = rrect(x, y, N / 2, 560, 330, 250, 56);
      const f = Math.min(tab, body);
      if (f < 1) {
        const a = Math.min(1, Math.max(0, 1 - f)), shade = body < 1 && y < 400 ? 0.92 : 1;
        px = [...mix(px.slice(0, 3), [255 * shade, 255 * shade, 255 * shade].map(Math.round), a), px[3]];
      }
    }
    buf.set(px, o);
  }
}

// minimal PNG encoder
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) buf.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
fs.writeFileSync(process.argv[2] || 'app-icon.png', Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]));
