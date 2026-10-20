import {
  BADGE_GLYPH_COLOR,
  CLAWD_ACCESSORY_COLORS,
  CLAWD_EYE_COLOR,
  CLAWD_PROP_COLORS,
} from '../constants.js';
import type { Outfit } from '../identity/clawdOutfit.js';
import type { AgentKind } from './agentViews.js';
import { drawOutfit, drawWatch, type Paint, repoAccessoryShown } from './clawdOutfits.js';
import type { ActivityProp } from './clawdTricks.js';

/** Theme read once from CSS (the canvas cannot use var()). */
export interface GraphTheme {
  stage: string;
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  line2: string;
  accent: string;
  amber: string;
  amberInk: string;
  amberBg: string;
  green: string;
  research: string;
}

export function readTheme(): GraphTheme {
  const css = getComputedStyle(document.documentElement);
  const t = (n: string) => css.getPropertyValue(n).trim();
  return {
    stage: t('--color-bg-dark'),
    surface: t('--color-bg'),
    ink: t('--color-text'),
    ink2: t('--color-text-2'),
    muted: t('--color-text-muted'),
    line: t('--color-border'),
    line2: t('--color-border-strong'),
    accent: t('--color-accent'),
    amber: t('--color-status-permission'),
    amberInk: t('--color-status-permission-text'),
    amberBg: t('--color-status-permission-bg'),
    green: t('--color-status-success'),
    research: t('--color-status-active'),
  };
}

const FONT = '"Plus Jakarta Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
const TAU = Math.PI * 2;

export function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
}

const channels = (hex: string): number[] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const toHex = (v: number) =>
  Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0');

/** A theme colour with alpha (as #rrggbbaa). */
export function rgba(hex: string, a: number): string {
  return '#' + channels(hex).map(toHex).join('') + toHex(a * 255);
}

export function darker(hex: string, k: number): string {
  return (
    '#' +
    channels(hex)
      .map((v) => toHex(v * (1 - k)))
      .join('')
  );
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

/** How Clawd stands for each state: typing, looking up, waving, smiling. */
export interface Pose {
  blink?: boolean;
  type?: number;
  look?: { dx: number; dy: number };
  bob?: number;
  wave?: number;
  happy?: boolean;
  /** Eyes shut (asleep). */
  sleep?: boolean;
  /** Repository kind: decides the accessory. */
  area?: string;
  /** What he holds for what he is doing; replaces the repo accessory. */
  prop?: ActivityProp;
  /** Turned around his centre (radians): spins, flips. */
  rotate?: number;
  /** Sideways nudge in screen px (a dance). */
  shiftX?: number;
  /** Size factor (an arrival grows from small). */
  scaleK?: number;
  /** What you dressed him in (headwear). */
  outfit?: Outfit;
  /** Impatient (clawdImpatience.ts): front foot up this frame… */
  footUp?: boolean;
  /** …or left arm up to his eyes, checking his watch. */
  watch?: boolean;
}

export function poseFor(kind: AgentKind, seed: number, t: number): Pose {
  const blink = (t * 0.9 + seed * 1.37) % 3.7 < 0.13;
  switch (kind) {
    case 'work':
    case 'meet':
      return { blink, type: Math.floor(t * 5 + seed * 3) % 2 };
    case 'think':
      return { blink, look: { dx: 0, dy: -1 }, bob: Math.sin(t * 1.4 + seed) > 0.2 ? -1 : 0 };
    case 'research':
      return { blink, look: { dx: 1, dy: -1 } };
    case 'needs':
      return { wave: Math.floor(t * 5) % 2 };
    case 'done':
      return { happy: true };
    default:
      return { blink };
  }
}

/**
 * Clawd on a 16×14 grid, snapped to device pixels so he stays crisp: body with
 * a darker base, eyes, arm nubs and four legs. (x, foot) is his foot center.
 */
export function drawClawd(
  ctx: CanvasRenderingContext2D,
  x: number,
  foot: number,
  scale: number,
  color: string,
  pose: Pose,
  dpr: number,
) {
  const p = Math.max(1, Math.round(scale * (pose.scaleK ?? 1) * dpr));
  const ox = Math.round((x + (pose.shiftX ?? 0)) * dpr) - 8 * p;
  const oy = Math.round(foot * dpr) - 14 * p;
  const dark = darker(color, 0.28);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (pose.rotate) {
    // Around his middle; crisp again as soon as he stops turning.
    ctx.translate(ox + 8 * p, oy + 7 * p);
    ctx.rotate(pose.rotate);
    ctx.translate(-(ox + 8 * p), -(oy + 7 * p));
  }
  const R = (gx: number, gy: number, w: number, h: number, c: string) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect(ox + gx * p, oy + gy * p, w * p, h * p);
  };
  const by = pose.bob ?? 0;
  for (const lx of [2, 4, 11, 13]) {
    const up = pose.footUp && lx === 13 ? 1 : 0;
    R(lx, 11 + by - up, 1, 3 - by, color);
  }
  R(1, by, 14, 10, color);
  R(1, by + 10, 14, 1, dark);
  const la = pose.watch ? 2 + by : 4 + by + (pose.type === 1 ? 1 : 0);
  const ra = 4 + by + (pose.type === 0 ? 1 : 0);
  R(0, la, 1, 2, color);
  if (pose.wave !== undefined) {
    R(15, by + (pose.wave ? 1 : 2), 1, 2, color);
    R(16, by + (pose.wave ? -1 : 0), 1, 2, color);
  } else {
    R(15, ra, 1, 2, color);
  }
  const lx = pose.watch ? -1 : (pose.look?.dx ?? 0);
  const ey = 2 + by + (pose.look?.dy ?? 0);
  if (pose.happy) {
    for (const ex of [3, 10]) {
      R(ex, ey + 1, 1, 1, CLAWD_EYE_COLOR);
      R(ex + 1, ey, 1, 1, CLAWD_EYE_COLOR);
      R(ex + 2, ey + 1, 1, 1, CLAWD_EYE_COLOR);
    }
  } else if (pose.sleep) {
    R(3, ey + 1, 2, 1, CLAWD_EYE_COLOR);
    R(10, ey + 1, 2, 1, CLAWD_EYE_COLOR);
  } else if (pose.blink) {
    R(4 + lx, ey + 1, 1, 1, CLAWD_EYE_COLOR);
    R(11 + lx, ey + 1, 1, 1, CLAWD_EYE_COLOR);
  } else {
    R(4 + lx, ey, 1, 2, CLAWD_EYE_COLOR);
    R(11 + lx, ey, 1, 2, CLAWD_EYE_COLOR);
  }
  // By slot (clawdOutfits.ts): the activity prop, the repo's accessory where
  // its slot is free, then your outfit on his head.
  const outfit = pose.outfit ?? 'none';
  if (pose.prop) drawProp(R, pose.prop, la, ra, ey);
  if (repoAccessoryShown(pose.area, outfit, pose.prop)) drawAccessory(R, pose.area, by, la);
  if (outfit !== 'none') drawOutfit(R, outfit, by);
  if (pose.watch) drawWatch(R, la);
  ctx.restore();
}

/** The repo accessory, on the same pixel grid as Clawd. */
function drawAccessory(R: Paint, area: string | undefined, by: number, leftArm: number) {
  const c = CLAWD_ACCESSORY_COLORS;
  if (area === 'backend') {
    R(3, by - 2, 10, 1, c.helmet);
    R(2, by - 1, 12, 1, c.helmet);
    R(1, by - 1, 1, 1, c.helmetEdge);
    R(14, by - 1, 1, 1, c.helmetEdge);
  } else if (area === 'webapp') {
    R(13, by - 1, 1, 1, c.pencilWood);
    R(14, by - 2, 1, 1, c.pencilWood);
    R(15, by - 3, 1, 1, c.pencilTip);
  } else if (area === 'flutter') {
    R(-2, leftArm - 1, 2, 3, c.phone);
    R(-2, leftArm, 1, 1, c.phoneScreen);
  }
}

/** What he holds for what he is doing, on his pixel grid. */
function drawProp(R: Paint, prop: ActivityProp, leftArm: number, rightArm: number, eyeY: number) {
  const c = CLAWD_PROP_COLORS;
  if (prop === 'glasses') {
    // A frame around each eye (x 4 and 11) and a bridge between them.
    for (const fx of [3, 10]) {
      R(fx, eyeY - 1, 3, 1, c.glasses);
      R(fx, eyeY + 2, 3, 1, c.glasses);
      R(fx, eyeY, 1, 2, c.glasses);
      R(fx + 2, eyeY, 1, 2, c.glasses);
    }
    R(6, eyeY, 4, 1, c.glasses);
  } else if (prop === 'wrench') {
    // Held up in the right hand: handle, then the open jaw on top.
    R(16, rightArm - 3, 1, 4, c.wrench);
    R(15, rightArm - 5, 3, 2, c.wrenchDark);
    R(16, rightArm - 5, 1, 1, c.wrench);
  } else {
    // A mug in the left hand, coffee showing at the rim.
    R(-3, leftArm - 1, 3, 3, c.mug);
    R(-3, leftArm - 1, 3, 1, c.coffee);
    R(-4, leftArm, 1, 1, c.mugEdge);
    R(-2, leftArm - 3, 1, 1, c.mugEdge); // a wisp of steam
  }
}

export const clawdHeight = (scale: number, dpr: number) =>
  (14 * Math.max(1, Math.round(scale * dpr))) / dpr;

/** Amber rings beat for the first 30 s of a wait, then the border just stays,
 *  with one short beat again at 5 and at 15 minutes: a reminder, not a siren
 *  for eight hours. */
export function isPulsing(waitedMs: number): boolean {
  const s = waitedMs / 1000;
  return s < 30 || (s >= 300 && s < 303) || (s >= 900 && s < 903);
}

/** The node disc: tinted fill in the agent's colour, outline by state. */
export function drawNodeDisc(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  r: number,
  color: string,
  kind: AgentKind,
  t: number,
  selected: boolean,
  pulsing = false,
) {
  if (kind === 'needs' && pulsing) {
    for (let j = 0; j < 3; j++) {
      const ph = (t * 0.7 + j / 3) % 1;
      circle(ctx, x, y, r + r * 0.9 * ph);
      ctx.strokeStyle = rgba(th.amber, (1 - ph) * 0.6);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  if (selected) {
    circle(ctx, x, y, r + 6);
    ctx.strokeStyle = rgba(th.ink, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const busy = kind === 'work' || kind === 'meet' || kind === 'research';
  const breathe = busy ? 1 + 0.03 * Math.sin(t * 2.2 + x) : 1;
  circle(ctx, x, y, r * breathe);
  ctx.fillStyle = rgba(kind === 'research' ? th.research : color, 0.13);
  ctx.fill();
  ctx.strokeStyle =
    kind === 'needs'
      ? th.amber
      : kind === 'done'
        ? th.green
        : kind === 'idle'
          ? th.line2
          : rgba(color, 0.6);
  ctx.lineWidth = kind === 'needs' ? 2.5 : 1.5;
  ctx.stroke();
}

export function drawThinkDots(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  top: number,
  t: number,
) {
  for (let i = 0; i < 3; i++) {
    const ph = (((t * 1.2 - i * 0.25) % 1) + 1) % 1;
    ctx.fillStyle = rgba(th.muted, 0.25 + 0.65 * (ph < 0.5 ? ph * 2 : 2 - ph * 2));
    circle(ctx, x - 6 + i * 6, top - 7 - (ph < 0.5 ? 1 : 0), 1.8);
    ctx.fill();
  }
}

export function drawAlertBadge(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  r: number,
) {
  circle(ctx, x, y, r);
  ctx.fillStyle = th.amber;
  ctx.fill();
  ctx.fillStyle = BADGE_GLYPH_COLOR;
  ctx.fillRect(x - r * 0.12, y - r * 0.55, Math.max(1.5, r * 0.24), r * 0.62);
  ctx.fillRect(x - r * 0.12, y + r * 0.22, Math.max(1.5, r * 0.24), r * 0.24);
}

export function drawCheckBadge(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  r: number,
) {
  circle(ctx, x, y, r);
  ctx.fillStyle = th.green;
  ctx.fill();
  ctx.strokeStyle = BADGE_GLYPH_COLOR;
  ctx.lineWidth = Math.max(1.4, r * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.45, y);
  ctx.lineTo(x - r * 0.1, y + r * 0.38);
  ctx.lineTo(x + r * 0.5, y - r * 0.35);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Size of a name + status label (to place it before drawing). */
export function measureLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  status: string,
  small: boolean,
): { w: number; h: number } {
  setFont(ctx, 600, small ? 11 : 12);
  const nw = ctx.measureText(name).width;
  setFont(ctx, 500, small ? 10.5 : 11);
  const sw = ctx.measureText(status).width;
  return { w: Math.ceil(Math.max(nw, sw) + 34), h: small ? 32 : 38 };
}

/** The little icon before a status line: what kind of state it is, at a glance. */
export function drawStatusIcon(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  kind: AgentKind,
  x: number,
  y: number,
  color: string,
) {
  ctx.save();
  switch (kind) {
    case 'needs':
      drawAlertBadge(ctx, th, x, y, 4.6);
      break;
    case 'done':
      ctx.strokeStyle = th.green;
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 3.2, y);
      ctx.lineTo(x - 1, y + 2.4);
      ctx.lineTo(x + 3.4, y - 2.8);
      ctx.stroke();
      break;
    case 'meet':
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      circle(ctx, x - 1.8, y, 2.7);
      ctx.stroke();
      circle(ctx, x + 1.8, y, 2.7);
      ctx.stroke();
      break;
    case 'research':
      ctx.strokeStyle = th.research;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y - 2.4);
      ctx.lineTo(x - 4, y - 3.4);
      ctx.lineTo(x - 4, y + 3);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x + 4, y + 3);
      ctx.lineTo(x + 4, y - 3.4);
      ctx.closePath();
      ctx.moveTo(x, y - 2.4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
      break;
    case 'work':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - 3, y - 3, 6, 6, 1.6);
      ctx.fill();
      break;
    case 'think':
      ctx.fillStyle = th.muted;
      for (let i = -1; i <= 1; i++) {
        circle(ctx, x + i * 3, y, 1.15);
        ctx.fill();
      }
      break;
    default:
      ctx.fillStyle = th.line2;
      circle(ctx, x, y, 2.2);
      ctx.fill();
  }
  ctx.restore();
}

/** Draw a name + status label in a box (from measureLabel / placeLabel). */
export function drawLabelAt(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  box: { x: number; y: number; w: number; h: number },
  name: string,
  status: string,
  kind: AgentKind,
  color: string,
  small: boolean,
) {
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 7);
  ctx.fillStyle = rgba(th.surface, 0.95);
  ctx.fill();
  ctx.lineWidth = kind === 'needs' ? 1.5 : 1;
  ctx.strokeStyle = kind === 'needs' ? th.amber : kind === 'done' ? rgba(th.green, 0.6) : th.line;
  ctx.stroke();
  const ny = box.y + (small ? 14 : 15);
  ctx.fillStyle = color;
  circle(ctx, box.x + 12, ny - 4, 3.4);
  ctx.fill();
  ctx.textAlign = 'left';
  setFont(ctx, 600, small ? 11 : 12);
  ctx.fillStyle = th.ink;
  ctx.fillText(name, box.x + 21, ny);
  const sy = ny + (small ? 13 : 16);
  drawStatusIcon(ctx, th, kind, box.x + 12, sy - 4, color);
  setFont(ctx, 500, small ? 10.5 : 11);
  ctx.fillStyle = kind === 'needs' ? th.amberInk : kind === 'done' ? th.green : th.ink2;
  ctx.fillText(status, box.x + 21, sy);
}

/** Name + status card under a node, with the agent's colour dot. Returns its box. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  top: number,
  name: string,
  status: string,
  kind: AgentKind,
  color: string,
  small: boolean,
  align: 'center' | 'left' = 'center',
): { x: number; y: number; w: number; h: number } {
  setFont(ctx, 600, small ? 11 : 12);
  const nw = ctx.measureText(name).width;
  setFont(ctx, 500, small ? 10.5 : 11);
  const sw = ctx.measureText(status).width;
  const w = Math.ceil(Math.max(nw, sw) + 30);
  const h = small ? 32 : 37;
  const bx = align === 'left' ? x : x - w / 2;
  ctx.beginPath();
  ctx.roundRect(bx, top, w, h, 7);
  ctx.fillStyle = rgba(th.surface, 0.95);
  ctx.fill();
  ctx.lineWidth = kind === 'needs' ? 1.5 : 1;
  ctx.strokeStyle = kind === 'needs' ? th.amber : kind === 'done' ? rgba(th.green, 0.6) : th.line;
  ctx.stroke();
  const ny = top + (small ? 14 : 15);
  ctx.fillStyle = color;
  circle(ctx, bx + 11.5, ny - 4, 3.4);
  ctx.fill();
  ctx.textAlign = 'left';
  setFont(ctx, 600, small ? 11 : 12);
  ctx.fillStyle = th.ink;
  ctx.fillText(name, bx + 20, ny);
  setFont(ctx, 500, small ? 10.5 : 11);
  ctx.fillStyle = kind === 'needs' ? th.amberInk : kind === 'done' ? th.green : th.ink2;
  ctx.fillText(status, bx + 20, ny + (small ? 13 : 16));
  return { x: bx, y: top, w, h };
}

/** A one-line name chip (a meeting's subagent), centred on x. */
export function drawChip(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  top: number,
  name: string,
  color: string,
  kind: AgentKind,
): { x: number; y: number; w: number; h: number } {
  setFont(ctx, 600, 11);
  const w = Math.ceil(ctx.measureText(name).width + 26);
  const h = 20;
  const bx = x - w / 2;
  ctx.beginPath();
  ctx.roundRect(bx, top, w, h, 6);
  ctx.fillStyle = rgba(th.surface, 0.95);
  ctx.fill();
  ctx.lineWidth = kind === 'needs' ? 1.5 : 1;
  ctx.strokeStyle = kind === 'needs' ? th.amber : th.line;
  ctx.stroke();
  ctx.fillStyle = color;
  circle(ctx, bx + 10, top + h / 2, 3.2);
  ctx.fill();
  ctx.fillStyle = th.ink;
  ctx.textAlign = 'left';
  ctx.fillText(name, bx + 17, top + 14);
  return { x: bx, y: top, w, h };
}

/** A colour lightened toward white (a meeting's subagents, softer than their lead). */
export function lighten(hex: string, k: number): string {
  return (
    '#' +
    channels(hex)
      .map((v) => toHex(v + (255 - v) * k))
      .join('')
  );
}

/** "Vos": the operator, where requests for a decision point to. */
export function drawVos(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  waiting: boolean,
  t: number,
  pulsing = waiting,
) {
  const w = 56;
  const h = 28;
  if (waiting && pulsing) {
    for (let j = 0; j < 2; j++) {
      const ph = (t * 0.8 + j * 0.5) % 1;
      const e = ph * 14;
      ctx.beginPath();
      ctx.roundRect(x - w / 2 - e, y - h / 2 - e, w + 2 * e, h + 2 * e, 14 + e);
      ctx.strokeStyle = rgba(th.amber, (1 - ph) * 0.6);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 14);
  ctx.fillStyle = th.ink;
  ctx.fill();
  if (waiting) {
    ctx.strokeStyle = th.amber;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = th.surface;
  circle(ctx, x - 13, y - 3, 3.1);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 13, y + 7.5, 6, Math.PI, TAU);
  ctx.fill();
  setFont(ctx, 600, 12);
  ctx.textAlign = 'left';
  ctx.fillText('Vos', x - 4, y + 4.5);
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(-size, -size * 0.62);
  ctx.lineTo(-size * 0.7, 0);
  ctx.lineTo(-size, size * 0.62);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** A request travelling to "Vos": marching dashes and an arrowhead. */
export function drawRequestLine(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  from: { x: number; y: number; r: number },
  to: { x: number; y: number },
  t: number,
  /** What it asks to run, shown on the line (the exact command, clipped). */
  ask?: string,
): { x: number; y: number; w: number; h: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const a = { x: from.x + (dx / d) * (from.r + 4), y: from.y + (dy / d) * (from.r + 4) };
  const b = { x: to.x - (dx / d) * 32, y: to.y - (dy / d) * 18 };
  ctx.strokeStyle = th.amber;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -t * 26;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  arrowHead(ctx, b.x, b.y, Math.atan2(dy, dx), 9, th.amber);
  if (!ask) return null;
  setFont(ctx, 500, 11, true);
  const w = Math.ceil(ctx.measureText(ask).width + 18);
  const h = 22;
  const px = (a.x + b.x) / 2 - w / 2;
  const py = (a.y + b.y) / 2 - h / 2;
  ctx.beginPath();
  ctx.roundRect(px, py, w, h, 6);
  ctx.fillStyle = th.amberBg;
  ctx.fill();
  ctx.strokeStyle = th.amber;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = th.amberInk;
  ctx.textAlign = 'left';
  ctx.fillText(ask, px + 9, py + 15);
  return { x: px, y: py, w, h };
}

/** A file passed between two agents: dashed line plus a chip with its name. */
export function drawFilePass(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  a: { x: number; y: number },
  b: { x: number; y: number },
  file: string,
  color: string,
  t: number,
) {
  ctx.strokeStyle = rgba(color, 0.7);
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -t * 20;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  setFont(ctx, 500, 10.5, true);
  const w = Math.ceil(ctx.measureText(file).width + 16);
  const cx = (a.x + b.x) / 2 - w / 2;
  const cy = (a.y + b.y) / 2 - 10;
  ctx.beginPath();
  ctx.roundRect(cx, cy, w, 20, 6);
  ctx.fillStyle = th.surface;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = th.ink;
  ctx.textAlign = 'left';
  ctx.fillText(file, cx + 8, cy + 14);
}

export function drawLibrary(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  r: number,
) {
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = rgba(th.research, 0.7);
  ctx.lineWidth = 1;
  circle(ctx, x, y, r);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(th.research, 0.06);
  ctx.fill();
  setFont(ctx, 600, 11);
  ctx.fillStyle = th.research;
  ctx.textAlign = 'center';
  ctx.fillText('Biblioteca', x, y - r - 6);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  w: number,
  h: number,
) {
  ctx.fillStyle = th.stage;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(th.line2, 0.6);
  for (let x = 13; x < w; x += 26) for (let y = 13; y < h; y += 26) ctx.fillRect(x, y, 1, 1);
}
