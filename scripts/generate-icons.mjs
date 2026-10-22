#!/usr/bin/env node
/**
 * Generates the extension PNG icons (16/32/48/128) without any image dependency:
 * a blue (#2563EB) shield on a transparent background with a white check mark,
 * rasterised with 4x4 supersampling and encoded with node:zlib.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
const BLUE = [0x25, 0x63, 0xeb];
const WHITE = [0xff, 0xff, 0xff];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Shield in a 32x32 design space (same silhouette as the ShieldLogo UI component). */
function inShield(x, y) {
  if (y < 2 || y > 30 || x < 4 || x > 28) return false;
  // Top edge: two slanted lines from (4,6.5) to (16,2) to (28,6.5).
  const topY = 2 + (Math.abs(x - 16) / 12) * 4.5;
  if (y < topY) return false;
  if (y <= 15) return true;
  // Lower half: curve narrowing to the tip at (16,30).
  const t = (y - 15) / 15; // 0..1
  const half = 12 * Math.sqrt(Math.max(0, 1 - t * t));
  return Math.abs(x - 16) <= half;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inCheck(x, y, stroke) {
  const d = Math.min(distToSegment(x, y, 10.5, 16.2, 14.4, 20.1), distToSegment(x, y, 14.4, 20.1, 22, 12));
  return d <= stroke / 2;
}

function render(size) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  const stroke = size <= 16 ? 3.6 : size <= 32 ? 3.1 : 2.7;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let shield = 0, check = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 32;
          const y = ((py + (sy + 0.5) / SS) / size) * 32;
          if (inShield(x, y)) {
            shield++;
            if (inCheck(x, y, stroke)) check++;
          }
        }
      }
      const n = SS * SS;
      const a = shield / n;
      const w = shield ? check / shield : 0;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(BLUE[c] * (1 - w) + WHITE[c] * w);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, buf);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${OUT}icon${size}.png`, render(size));
  console.log(`wrote public/icons/icon${size}.png`);
}
