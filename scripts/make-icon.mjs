// Generates media/icon.png (128x128 RGBA) without any image libraries.
// Draws a small "state machine" motif: three connected nodes, with the middle
// one accented green (defines a variable) and the others blue (reference it) —
// a nod to the extension's variable-highlight feature.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 128;
const H = 128;
const buf = Buffer.alloc(W * H * 4);

function px(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRect(x0, y0, x1, y1, color, radius = 0) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (radius) {
        const cx = x < x0 + radius ? x0 + radius : x >= x1 - radius ? x1 - radius - 1 : x;
        const cy = y < y0 + radius ? y0 + radius : y >= y1 - radius ? y1 - radius - 1 : y;
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
      }
      px(x, y, color);
    }
  }
}

function strokeRect(x0, y0, x1, y1, color, t, radius) {
  fillRect(x0, y0, x1, y1, color, radius);
  // punch out the interior, leaving a border of thickness t.
  fillRect(x0 + t, y0 + t, x1 - t, y1 - t, NODE_FILL, Math.max(0, radius - t));
}

function disc(cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, color);
    }
  }
}

const BG = [30, 35, 48, 255];
const NODE_FILL = [45, 54, 80, 255];
const EDGE = [90, 100, 128, 255];
const BLUE = [55, 148, 255, 255];
const GREEN = [76, 175, 80, 255];

// background
fillRect(0, 0, W, H, BG);

// edges (behind nodes)
fillRect(62, 40, 66, 56, EDGE);
fillRect(62, 76, 66, 92, EDGE);

// three nodes
strokeRect(36, 18, 92, 42, BLUE, 3, 8);
strokeRect(36, 54, 92, 78, GREEN, 3, 8);
strokeRect(36, 90, 92, 114, BLUE, 3, 8);

// variable dots: green "definition" on the middle node, blue "references" above/below
disc(80, 30, 4, BLUE);
disc(80, 66, 4, GREEN);
disc(80, 102, 4, BLUE);

// --- encode PNG ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// 10,11,12 = 0 (compression, filter, interlace)

const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0; // filter: none
  buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../media/icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
