// Generates the bundled character sheets as Clawd (the Claude Code mascot) in
// six body colours, replacing the human characters. Same format the loader
// expects (core/src/assets/constants.ts): 112×96 PNG, rows = down / up / right
// (left is mirrored at runtime), 7 frames of 16×32 per row:
//   0-2 walk · 3-4 typing (seated) · 5-6 reading (seated).
//
//   node scripts/generate-clawd-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../webview-ui/public/assets/characters',
);

/** Body colour + shade per palette index (char_N.png). 0 is the real Clawd. */
const PALETTES = [
  { name: 'naranja', body: '#d97757', shade: '#b85c3e' },
  { name: 'azul', body: '#5b8def', shade: '#3f6cc4' },
  { name: 'verde', body: '#4fae6b', shade: '#36864f' },
  { name: 'violeta', body: '#9a6ad6', shade: '#764cae' },
  { name: 'rosa', body: '#e2709a', shade: '#bb507a' },
  { name: 'gris', body: '#8c8f99', shade: '#6a6d76' },
];
const EYE = '#1b1b1b';
const PAPER = '#f4f1e8';
const PAPER_LINE = '#b9b2a0';

const FRAME_W = 16;
const FRAME_H = 32;
const FRAMES = 7;
const ROWS = ['down', 'up', 'right'];

function hex(color) {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One 16×32 frame as a sparse pixel painter. */
function frame() {
  const pixels = new Map();
  const rect = (x, y, w, h, color) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < FRAME_W && py >= 0 && py < FRAME_H) pixels.set(`${px},${py}`, color);
      }
    }
  };
  return { pixels, rect };
}

/**
 * Draw Clawd. `top` is the body's first row; seated frames sit 3 px lower
 * (like the human sheets) with legs tucked. `legs` picks the walk pose,
 * `arms` the typing pose, `look` the reading glance.
 */
function drawClawd(f, { dir, pal, top, legs, arms, seated, reading, look }) {
  const { rect } = f;
  const front = dir === 'down';
  const side = dir === 'right';
  // Body: wide block, like the real mascot; narrower in profile.
  const bx = side ? 3 : 1;
  const bw = side ? 11 : 14;
  const bh = 11;
  rect(bx, top, bw, bh, pal.body);
  rect(bx, top + bh - 1, bw, 1, pal.shade);

  // Legs: four stubs (two in profile); hidden while seated.
  if (!seated) {
    const legTop = top + bh;
    const stubs = side ? [5, 10] : [2, 5, 9, 12];
    stubs.forEach((x, i) => {
      const lifted = legs !== 0 && (i % 2 === 0) === (legs === 1);
      rect(x, legTop, 1, lifted ? 2 : 3, pal.shade);
    });
  }

  // Arms: little nubs on the sides; they bob while typing.
  const armY = top + 4;
  if (side) {
    rect(bx + bw, armY + (arms === 1 ? 1 : 0), 1, 2, pal.body);
  } else {
    rect(0, armY + (arms === 1 ? 1 : 0), 1, 2, pal.body);
    rect(15, armY + (arms === 2 ? 1 : 0), 1, 2, pal.body);
  }

  // Eyes: two tall pixels from the front, one in profile, none from behind.
  const eyeY = top + 3;
  const shift = reading ? look : 0;
  if (front) {
    rect(4 + shift, eyeY, 1, 2, EYE);
    rect(10 + shift, eyeY, 1, 2, EYE);
  } else if (side) {
    rect(11, eyeY, 1, 2, EYE);
  }

  // Reading: a sheet held in front (visible from the front and in profile).
  if (reading && !(dir === 'up')) {
    const px = side ? 12 : 4;
    rect(px, top + 6, side ? 4 : 8, 5, PAPER);
    rect(px + 1, top + 7, side ? 2 : 6, 1, PAPER_LINE);
    rect(px + 1, top + 9, side ? 2 : 5, 1, PAPER_LINE);
  }
}

function frameFor(dir, index, pal) {
  const f = frame();
  const standingTop = 15; // body rows 15-25, legs 26-28: feet where the humans' are
  const seatedTop = 18;
  if (index <= 2) {
    // walk: neutral, one pair up, the other pair up (+1 px bob)
    drawClawd(f, { dir, pal, top: standingTop - (index === 0 ? 0 : 1), legs: index, arms: 0 });
  } else if (index <= 4) {
    drawClawd(f, { dir, pal, top: seatedTop, seated: true, arms: index === 3 ? 1 : 2 });
  } else {
    drawClawd(f, {
      dir,
      pal,
      top: seatedTop,
      seated: true,
      arms: 0,
      reading: true,
      look: index === 5 ? 0 : 1,
    });
  }
  return f.pixels;
}

function sheet(pal) {
  const png = new PNG({ width: FRAME_W * FRAMES, height: FRAME_H * ROWS.length });
  ROWS.forEach((dir, row) => {
    for (let i = 0; i < FRAMES; i++) {
      for (const [key, color] of frameFor(dir, i, pal)) {
        const [x, y] = key.split(',').map(Number);
        const [r, g, b] = hex(color);
        const o = ((row * FRAME_H + y) * png.width + i * FRAME_W + x) * 4;
        png.data[o] = r;
        png.data[o + 1] = g;
        png.data[o + 2] = b;
        png.data[o + 3] = 255;
      }
    }
  });
  return PNG.sync.write(png);
}

PALETTES.forEach((pal, i) => {
  const file = path.join(OUT_DIR, `char_${i}.png`);
  fs.writeFileSync(file, sheet(pal));
  console.log(`✓ ${path.relative(process.cwd(), file)} (${pal.name})`);
});
