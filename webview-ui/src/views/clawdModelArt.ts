import { CLAWD_EYE_COLOR, CLAWD_MODEL_COLORS } from '../constants.js';
import { rotateHue } from './clawdColor.js';
import { type BubbleRim, type ClawdForm, type ClawdMaterial, headDrop } from './clawdLook.js';
import type { Paint } from './clawdOutfits.js';

/**
 * The parts of Clawd that change with his model (clawdLook.ts), on the same
 * 16×14 grid as graphDraw's drawClawd: his body and what it is made of, arms
 * or claws, eyes, the hatchling's sprout and the legend's antennae and cape,
 * and the bubble's outline. `anim` is the clock for their own little motions
 * (a shine passing, a cape in the wind); absent, they stand still (calm mode).
 */

const TAU = Math.PI * 2;
const C = CLAWD_MODEL_COLORS;

const shades = new Map<string, string>();
/** A #rrggbb colour pulled toward white (k > 0) or black (k < 0). */
function tint(hex: string, k: number): string {
  const key = `${hex}${k}`;
  let out = shades.get(key);
  if (!out) {
    const n = parseInt(hex.slice(1, 7), 16);
    const to = (v: number) =>
      Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))
        .toString(16)
        .padStart(2, '0');
    out = `#${to((n >> 16) & 255)}${to((n >> 8) & 255)}${to(n & 255)}`;
    shades.set(key, out);
  }
  return out;
}

function hued(hex: string, degrees: number): string {
  const key = `${hex}h${degrees}`;
  let out = shades.get(key);
  if (!out) {
    out = rotateHue(hex, degrees);
    shades.set(key, out);
  }
  return out;
}

const hash = (n: number) => Math.imul(n ^ 0x5bd1e995, 2654435761) >>> 0;

/** One cell of the material, or null to leave the body colour. `k` counts
 *  rows from his top, `kb` from his base. */
type MaterialCell = (x: number, k: number, kb: number) => string | null;

function materialCells(
  material: ClawdMaterial,
  color: string,
  rows: number,
  anim: number | undefined,
): MaterialCell {
  if (material === 'paper') {
    // Origami: a lit face, the fold, a face in shadow.
    return (x, k) => (x + k <= 7 ? tint(color, 0.26) : x - k >= 8 ? tint(color, -0.13) : null);
  }
  if (material === 'plush') {
    // A seam down his middle and a stitched patch low on the left.
    return (x, k, kb) => {
      if (x === 8 && k % 2 === 1) return tint(color, 0.5);
      if (x < 2 || x > 4 || kb < 1 || kb > 3) return null;
      const edge = x === 2 || x === 4 || kb === 1 || kb === 3;
      return edge && (x + kb) % 2 === 0 ? tint(color, 0.55) : tint(color, 0.22);
    };
  }
  if (material === 'metal') {
    // Polished: lit on top, darker below, two rivets and a shine passing.
    const sweep = anim === undefined ? null : (((anim * 0.9) % 3.4) / 3.4) * 30 - 8;
    return (x, k, kb) => {
      if ((x === 2 || x === 13) && kb === 1) return tint(color, 0.5);
      const d = sweep === null ? -1 : x + k * 0.6 - sweep;
      if (d >= 0 && d < 1.5) return tint(color, 0.72);
      if (d >= 1.5 && d < 2.6) return tint(color, 0.36);
      if (k <= 1) return tint(color, 0.18);
      return kb <= 2 ? tint(color, -0.1) : null;
    };
  }
  // Hologram: the hue ripples around his own colour, with a glint or two.
  const t = anim ?? 0;
  const glint = anim === undefined ? -1 : Math.floor(anim * 3);
  const glints =
    glint < 0
      ? []
      : [
          [hash(glint) % 14, hash(glint + 99) % rows],
          [hash(glint + 7) % 14, hash(glint + 51) % rows],
        ];
  return (x, k) => {
    if (glints.some(([gx, gk]) => gx === x - 1 && gk === k)) return C.shine;
    return hued(color, Math.round(Math.sin(t * 1.4 + (x - k) * 0.45) * 10) * 5);
  };
}

/** His body and its darker base: a hatchling is three rows shorter, with
 *  rounded shoulders. The material paints over it cell by cell. */
export function drawBody(
  R: Paint,
  color: string,
  dark: string,
  by: number,
  look: { form?: ClawdForm; material?: ClawdMaterial; anim?: number },
): void {
  const top = headDrop(look.form);
  if (top) {
    R(2, by + top, 12, 1, color);
    R(1, by + top + 1, 14, 9 - top, color);
  } else {
    R(1, by, 14, 10, color);
  }
  R(1, by + 10, 14, 1, dark);
  if (!look.material) return;
  const first = by + top;
  const last = by + 9;
  const cell = materialCells(look.material, color, last - first + 1, look.anim);
  for (let row = first; row <= last; row++) {
    const rounded = top > 0 && row === first;
    for (let x = rounded ? 2 : 1; x <= (rounded ? 13 : 14); x++) {
      const c = cell(x, row - first, last - row);
      if (c) R(x, row, 1, 1, c);
    }
  }
}

/** A claw on his left (side -1) or right (side 1): wrist at row `y`, the
 *  pincer above it, open or shut. */
function drawClaw(R: Paint, side: -1 | 1, y: number, open: boolean, color: string, tip: string) {
  const cell = (gx: number, gy: number, c: string) => R(side < 0 ? gx : 15 - gx, gy, 1, 1, c);
  cell(0, y + 1, color);
  for (const gx of [0, -1, -2]) cell(gx, y, color);
  for (const gx of [-1, -2, -3]) cell(gx, y - 1, color);
  cell(-3, y - 2, tip);
  cell(open ? -1 : -2, y - 2, tip);
}

export interface ArmPose {
  /** Which arm is down this typing frame (graphDraw's Pose.type). */
  type?: number;
  /** Waving with the right arm (needs you). */
  wave?: number;
  /** Left arm up to his eyes, checking the time. */
  watch?: boolean;
  /** That hand holds something (mug, phone, wrench): it stays an arm. */
  leftHeld: boolean;
  rightHeld: boolean;
}

/** Arm nubs, or claws for the bigger models; a claw gives way to whatever
 *  that hand holds. Returns the arm rows the props hang from. */
export function drawArms(
  R: Paint,
  color: string,
  by: number,
  form: ClawdForm | undefined,
  a: ArmPose,
  anim: number | undefined,
): { la: number; ra: number } {
  const row = 4 + by + (form === 'hatchling' ? 2 : 0);
  const la = a.watch ? row - 2 : row + (a.type === 1 ? 1 : 0);
  const ra = row + (a.type === 0 ? 1 : 0);
  const claws = form === 'claws' || form === 'legend';
  const tip = form === 'legend' ? C.gold : color;
  // Snips with his typing; otherwise now and then (still in calm mode).
  const snip =
    a.type !== undefined ? a.type === 1 : anim !== undefined && Math.floor(anim * 0.8) % 3 === 0;
  if (claws && !a.leftHeld && !a.watch) drawClaw(R, -1, la, snip, color, tip);
  else R(0, la, 1, 2, color);
  if (a.wave !== undefined) {
    const w = row - 4;
    if (claws) {
      R(15, w + 2, 1, 2, color);
      drawClaw(R, 1, w + (a.wave ? -1 : 0), a.wave === 1, color, tip);
    } else {
      R(15, w + (a.wave ? 1 : 2), 1, 2, color);
      R(16, w + (a.wave ? -1 : 0), 1, 2, color);
    }
  } else if (claws && !a.rightHeld) {
    drawClaw(R, 1, ra, !snip, color, tip);
  } else {
    R(15, ra, 1, 2, color);
  }
  return { la, ra };
}

export interface EyePose {
  happy?: boolean;
  sleep?: boolean;
  blink?: boolean;
  /** Low effort: calm, half-lidded eyes. */
  effort?: string;
}

/** His eyes at row `ey`, looking `lx` aside. A hatchling's are big, with a
 *  shine. */
export function drawEyes(R: Paint, pose: EyePose, lx: number, ey: number, big: boolean): void {
  const ink = CLAWD_EYE_COLOR;
  if (pose.happy) {
    for (const ex of [3, 10]) {
      R(ex, ey + 1, 1, 1, ink);
      R(ex + 1, ey, 1, 1, ink);
      R(ex + 2, ey + 1, 1, 1, ink);
    }
    return;
  }
  if (pose.sleep) {
    R(3, ey + 1, 2, 1, ink);
    R(10, ey + 1, 2, 1, ink);
    return;
  }
  const lidded = pose.blink || pose.effort === 'low';
  for (const ex of big ? [3, 11] : [4, 11]) {
    const w = big ? 2 : 1;
    if (lidded) {
      R(ex + lx, ey + 1, w, 1, ink);
    } else {
      R(ex + lx, ey, w, 2, ink);
      if (big) R(ex + lx, ey, 1, 1, C.shine);
    }
  }
}

/** On a free head: the hatchling's sprout or the legend's antennae, whose
 *  golden tips take turns to shine. */
export function drawCrest(
  R: Paint,
  form: ClawdForm | undefined,
  hy: number,
  anim: number | undefined,
): void {
  if (form === 'hatchling') {
    const sway = anim !== undefined && Math.sin(anim * 1.8) > 0.55 ? 1 : 0;
    R(8, hy - 2, 1, 2, C.stem);
    R(8 + sway, hy - 3, 1, 1, C.stem);
    R(9 + sway, hy - 3, 2, 1, C.leaf);
    R(6, hy - 2, 2, 1, C.leaf);
  } else if (form === 'legend') {
    R(5, hy - 1, 1, 1, C.stalk);
    R(4, hy - 2, 1, 1, C.stalk);
    R(10, hy - 1, 1, 1, C.stalk);
    R(11, hy - 2, 1, 1, C.stalk);
    const lit = anim !== undefined && Math.sin(anim * 3.4) > 0;
    R(4, hy - 3, 1, 1, lit ? C.goldLight : C.gold);
    R(11, hy - 3, 1, 1, lit ? C.gold : C.goldLight);
  }
}

/** The legend's cape, behind him: it widens toward his feet and flutters to
 *  his left. Drawn before the body. */
export function drawCape(R: Paint, hy: number, by: number, anim: number | undefined): void {
  const rows = by + 11 - hy;
  for (let k = 0; k < rows; k++) {
    const flutter =
      anim !== undefined && k > 3 ? Math.round(Math.sin(anim * 3.2 - k * 0.8) * 0.9) : 0;
    const w = Math.max(1, 1 + Math.floor(k / 3) + flutter);
    R(1 - w, hy + 1 + k, w, 1, k % 4 === 3 ? C.capeDark : C.cape);
  }
  R(15, hy + 1, 1, 3, C.capeDark);
}

/** Traces the bubble's outline: a circle, or the medal's scalloped edge
 *  (it turns slowly with `spin`). */
export function traceBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rim: BubbleRim,
  spin: number,
): void {
  ctx.beginPath();
  if (rim !== 'medal') {
    ctx.arc(x, y, Math.max(0, r), 0, TAU);
    return;
  }
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * TAU;
    const rr = Math.max(0, r + 2.6 * Math.cos(18 * (a + spin * 0.12)));
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Strokes what traceBubble traced, in the model's way, with the stroke
 *  already set (the state's colour): seven long segments, one ring, or an
 *  inner ring too. Never dotted: the graph's dashes are supervisor and
 *  file-pass lines. */
export function strokeBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rim: BubbleRim,
  spin: number,
): void {
  if (rim === 'segments') {
    const seg = TAU / 7;
    const from = spin * 0.25;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r), from + i * seg, from + (i + 1) * seg - 0.16);
      ctx.stroke();
    }
    return;
  }
  ctx.stroke();
  if (rim === 'single') return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r - (rim === 'double' ? 5 : 7)), 0, TAU);
  ctx.lineWidth = rim === 'double' ? 1.3 : 1;
  ctx.globalAlpha *= rim === 'double' ? 0.75 : 0.6;
  ctx.stroke();
  ctx.restore();
}
