// Generates the office's icons: Clawd (orange) on a warm, rounded light tile.
// Clawd is drawn with smooth rounded shapes (not his pixel grid): a window
// title bar shows the icon at 16-32 px, where pixel art scaled by a
// non-integer factor turned to mush (2026-10-19). Every size is rendered on
// its own, antialiased, and icon.svg is the same drawing for the browser.
// Writes webview-ui/public/icons/{icon.svg,icon-*.png,oficina.ico}, the Apple
// touch icons and favicon.ico (PNG-in-ICO). No dependencies: a tiny PNG
// encoder over zlib.
//
//   node scripts/generate-office-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PUBLIC = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')),
  '..',
  'webview-ui',
  'public',
);

const TILE = [0xf8, 0xf3, 0xed];
const EDGE = [0xe8, 0xe0, 0xd5];
const BODY = [0xd9, 0x77, 0x57];
const LEG = [0xc2, 0x63, 0x44];
const EYE = [0x23, 0x1f, 0x1c];

/** Clawd on a 16×14 box: [x, y, w, h, corner radius, colour], drawn in order. */
const CLAWD = [
  ...[2, 4, 10.8, 12.8].map((x) => [x, 9, 1.2, 4.3, 0.6, LEG]),
  [0, 3.6, 2, 2.6, 0.8, BODY],
  [14, 3.6, 2, 2.6, 0.8, BODY],
  [1, 0, 14, 10.4, 2, BODY],
  [4, 2.2, 1.3, 2.6, 0.65, EYE],
  [10.7, 2.2, 1.3, 2.6, 0.65, EYE],
];

const SS = 8; // supersamples per pixel side

/** Is (px, py) inside the rounded rect? */
function inRoundRect(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** Where Clawd sits on an n-px tile: bigger on the tiny sizes, where every pixel counts. */
function clawdBox(n) {
  const unit = (n * (n <= 32 ? 0.82 : 0.66)) / 16;
  return { unit, ox: (n - 16 * unit) / 2, oy: (n - 14 * unit) / 2 + unit * 0.4 };
}

function render(n) {
  const px = new Uint8Array(n * n * 4);
  const tile = [0, 0, n, n, n * 0.22];
  const edge = Math.max(1, n / 64);
  const inner = [edge, edge, n - 2 * edge, n - 2 * edge, n * 0.22 - edge];
  const { unit, ox, oy } = clawdBox(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let cover = 0;
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          if (!inRoundRect(fx, fy, tile)) continue;
          cover++;
          let c = inRoundRect(fx, fy, inner) ? TILE : EDGE;
          const gx = (fx - ox) / unit;
          const gy = (fy - oy) / unit;
          for (const shape of CLAWD) if (inRoundRect(gx, gy, shape)) c = shape[5];
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const i = (y * n + x) * 4;
      if (cover === 0) continue;
      px.set([...acc.map((v) => Math.round(v / cover)), Math.round((cover / (SS * SS)) * 255)], i);
    }
  }
  return px;
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/** The same drawing as an SVG, crisp at any size the browser picks. */
function svg() {
  const n = 64;
  const { unit, ox, oy } = clawdBox(n);
  const f = (v) => Number(v.toFixed(2));
  const shapes = CLAWD.map(
    ([x, y, w, h, r, c]) =>
      `<rect x="${f(ox + x * unit)}" y="${f(oy + y * unit)}" width="${f(w * unit)}" height="${f(h * unit)}" rx="${f(r * unit)}" fill="${hex(c)}"/>`,
  ).join('');
  const r = n * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect x="0.5" y="0.5" width="${n - 1}" height="${n - 1}" rx="${r}" fill="${hex(TILE)}" stroke="${hex(EDGE)}"/>${shapes}</svg>\n`;
}

function png(n, rgba) {
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * n * 4, n * 4).copy(raw, y * (n * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** An .ico holding PNG images (every browser since Vista-era reads it). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ n, data }) => {
    const e = Buffer.alloc(16);
    e[0] = n >= 256 ? 0 : n;
    e[1] = n >= 256 ? 0 : n;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images.map((i) => i.data)]);
}

const out = (rel, data) => {
  fs.writeFileSync(path.join(PUBLIC, rel), data);
  console.log('wrote', rel, data.length, 'bytes');
};
out('icons/icon.svg', svg());
for (const n of [16, 32, 48, 192, 256, 512]) out(`icons/icon-${n}.png`, png(n, render(n)));
out('apple-touch-icon.png', png(180, render(180)));
out('apple-touch-icon-precomposed.png', png(180, render(180)));
out('favicon.ico', ico([16, 24, 32, 48, 64].map((n) => ({ n, data: png(n, render(n)) }))));
// The desktop / Start menu shortcut icon: every size Windows may ask for.
out(
  'icons/oficina.ico',
  ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256].map((n) => ({ n, data: png(n, render(n)) }))),
);
