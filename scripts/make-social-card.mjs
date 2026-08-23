// Generates social-preview.png (1280x640) and assets/og-card.png (1200x630).
//
// Dependency-free on purpose: zlib is in the standard library and a PNG is just IDAT chunks, so a
// public repo shipping unsigned installers does not need to take an image library onto its
// supply chain to draw a rectangle and a curve.
//
// No text rendering library either, so the wordmark comes from a small hand-defined 5x7 bitmap
// font covering only the glyphs actually used. That is less clever than shelling out to a
// headless browser and it has no moving parts.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------- 5x7 glyphs, one string row per scanline, '#' = ink ----------
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function makeCanvas(w, h) {
  return { w, h, px: new Uint8Array(w * h * 3) };
}
function setPx(c, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 3;
  c.px[i] = r; c.px[i + 1] = g; c.px[i + 2] = b;
}
function blend(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// M3-ish dark surface with a warm primary. Deliberately one palette, committed to, rather than a
// theme-aware pair: a social card is rendered by someone else's chat client, not by our page.
const SURFACE = [16, 18, 24];
const SURFACE_2 = [30, 27, 38];
const PRIMARY = [208, 188, 255];
const ACCENT = [255, 184, 108];
const MUTED = [120, 124, 140];

function fillBackground(c) {
  for (let y = 0; y < c.h; y++) {
    // vertical gradient, plus a soft diagonal lift toward the top-right
    const t = y / c.h;
    for (let x = 0; x < c.w; x++) {
      const d = (x / c.w) * 0.35;
      setPx(c, x, y, blend(SURFACE_2, SURFACE, Math.min(1, t + d)));
    }
  }
}

function drawText(c, text, ox, oy, scale, colour) {
  let cx = ox;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch];
    // Throw rather than skip. A missing glyph silently dropped is how a wordmark ships
    // looking like garbage while every structural check on the PNG still passes.
    if (!glyph) throw new Error(`make-social-card: no glyph for ${JSON.stringify(ch)}`);
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPx(c, cx + gx * scale + sx, oy + gy * scale + sy, colour);
          }
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

function disc(c, x0, y0, r, colour) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) setPx(c, Math.round(x0 + x), Math.round(y0 + y), colour);
    }
  }
}

// Cubic bezier, sampled densely and stamped with a tapering disc — the whip.
function whip(c, pts, widthStart, widthEnd, colour) {
  const [p0, p1, p2, p3] = pts;
  const STEPS = 2600;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const w = widthStart + (widthEnd - widthStart) * t;
    disc(c, x, y, Math.max(0.5, w), colour);
  }
}

function encodePng(c) {
  const raw = Buffer.alloc((c.w * 3 + 1) * c.h);
  let o = 0;
  for (let y = 0; y < c.h; y++) {
    raw[o++] = 0; // filter: none
    Buffer.from(c.px.buffer, y * c.w * 3, c.w * 3).copy(raw, o);
    o += c.w * 3;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let cc = n;
      for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
      CRC_TABLE[n] = cc;
    }
  }
  let crc = -1;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

function render(w, h) {
  const c = makeCanvas(w, h);
  fillBackground(c);

  const s = w / 1280; // scale everything off the 1280-wide design

  // The whip: a long lash sweeping in from the lower left, cracking up to the right.
  whip(c, [
    [w * 0.04, h * 0.86],
    [w * 0.34, h * 0.80],
    [w * 0.52, h * 0.30],
    [w * 0.74, h * 0.40],
  ], 7 * s, 2 * s, ACCENT);
  // the curl at the end
  whip(c, [
    [w * 0.74, h * 0.40],
    [w * 0.86, h * 0.46],
    [w * 0.88, h * 0.22],
    [w * 0.775, h * 0.255],
  ], 2 * s, 1 * s, ACCENT);
  // the crack
  disc(c, w * 0.775, h * 0.255, 5 * s, PRIMARY);

  // Wordmark
  const scale = Math.round(9 * s);
  drawText(c, 'AGENT-WHIP', Math.round(w * 0.06), Math.round(h * 0.20), scale, PRIMARY);
  // Strapline
  const small = Math.max(1, Math.round(3.4 * s));
  drawText(c, 'A MODE SWITCH NOT AN INTERRUPT', Math.round(w * 0.062), Math.round(h * 0.40), small, MUTED);

  return c;
}

for (const [path, w, h] of [
  [new URL('../social-preview.png', import.meta.url), 1280, 640],
  [new URL('../assets/og-card.png', import.meta.url), 1200, 630],
]) {
  const file = path.pathname.replace(/^\/([A-Za-z]:)/, '$1');
  mkdirSync(dirname(file), { recursive: true });
  const png = encodePng(render(w, h));
  writeFileSync(file, png);
  console.log(`wrote ${file} (${w}x${h}, ${png.length} bytes)`);
}
