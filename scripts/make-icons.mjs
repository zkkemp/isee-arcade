/**
 * Generates the PWA icon set as real PNGs.
 *
 * Written by hand rather than pulling in an image library: the artwork is a
 * gradient plus a triangle, and a raw PNG encoder is about 40 lines. Run with
 * `node scripts/make-icons.mjs` after changing the design.
 *
 * Icons are full-bleed (no transparent corners) because iOS composites
 * transparency against black and applies its own corner mask at install time.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, '..', 'public');

// --- PNG encoding ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgb: (x, y) => [r, g, b]. Emits an opaque 8-bit RGB PNG. */
function encodePng(size, rgb) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o] = 0; // filter type: none
    o += 1;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = rgb(x, y);
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      o += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  // 10..12 = compression, filter, interlace — all 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- artwork ---

const TOP = [124, 58, 237]; // violet
const BOTTOM = [67, 56, 202]; // indigo

/**
 * Coverage of the play triangle at a point, supersampled 3x3 so the diagonal
 * edges don't look jagged at 192px.
 */
function triangleCoverage(x, y, size) {
  const x0 = size * 0.36;
  const x1 = size * 0.70;
  const cy = size / 2;
  const halfAtBase = size * 0.18;

  let hits = 0;
  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      if (px < x0 || px > x1) continue;
      const t = (px - x0) / (x1 - x0);
      if (Math.abs(py - cy) <= halfAtBase * (1 - t)) hits += 1;
    }
  }
  return hits / 9;
}

function pixel(x, y, size) {
  const t = y / (size - 1);
  const bg = [
    Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
    Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
    Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
  ];

  const cov = triangleCoverage(x, y, size);
  if (cov === 0) return bg;
  return [
    Math.round(bg[0] + (255 - bg[0]) * cov),
    Math.round(bg[1] + (255 - bg[1]) * cov),
    Math.round(bg[2] + (255 - bg[2]) * cov),
  ];
}

// --- write ---

mkdirSync(PUBLIC_DIR, { recursive: true });

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]) {
  const png = encodePng(size, (x, y) => pixel(x, y, size));
  writeFileSync(join(PUBLIC_DIR, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}
