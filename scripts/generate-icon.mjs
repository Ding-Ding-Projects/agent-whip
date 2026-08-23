#!/usr/bin/env node
// Generates assets/icon.png entirely with Node built-ins (zlib for DEFLATE, crypto for the CRC
// table) -- no third-party image library, no downloaded asset, no network access. Draws a
// stylised whip curve (a decaying sine sweep) in white over an M3 primary-container purple disc.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 32;

// -- tiny from-scratch PNG encoder --------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type "none" per scanline
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// -- pixel content: an M3 primary-container disc with a white whip-curve sweep -------------------
function setPixel(rgba, x, y, r, g, b, a) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function draw() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 1;

  // M3-ish seed purple disc (#6750a4), transparent outside the circle.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const inside = dx * dx + dy * dy <= radius * radius;
      setPixel(rgba, x, y, 0x67, 0x50, 0xa4, inside ? 255 : 0);
    }
  }

  // The whip: a decaying sine sweep from upper-left "handle" to a "cracking" tip, drawn as a thick
  // white stroke by rasterizing many sample points along the curve.
  const steps = 200;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = 6 + t * 20;
    const decay = 1 - t;
    const y = 8 + t * 16 + Math.sin(t * Math.PI * 3.2) * 5 * decay;
    const thickness = 1.6 * (1 - 0.6 * t) + 0.4;
    for (let ox = -thickness; ox <= thickness; ox++) {
      for (let oy = -thickness; oy <= thickness; oy++) {
        if (ox * ox + oy * oy <= thickness * thickness) {
          setPixel(rgba, Math.round(x + ox), Math.round(y + oy), 0xff, 0xff, 0xff, 255);
        }
      }
    }
  }

  return rgba;
}

function main() {
  const png = encodePng(SIZE, SIZE, draw());
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = join(here, '..', 'assets', 'icon.png');
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}

main();
