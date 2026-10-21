import type { AgentView } from './agentViews.js';
import type { Bounds } from './graphCamera.js';
import { darker, drawCheckBadge, type GraphTheme, lighten, rgba, setFont } from './graphDraw.js';

type Box = { x: number; y: number; w: number; h: number };

const DETAIL_W = 220;
const DETAIL_TASKS = 4;

/**
 * The close-up under an agent's label (graph zoomed in): its task list with
 * progress, how full its context is, and the start of its last answer — all
 * straight from what the session wrote.
 */
export function drawDetailCard(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  top: number,
  v: AgentView,
): Box {
  const lines = detailLines(ctx, v);
  const h = 12 + lines.length * 14 + (v.contextPct !== undefined ? 14 : 0);
  const bx = x - DETAIL_W / 2;
  ctx.beginPath();
  ctx.roundRect(bx, top, DETAIL_W, h, 8);
  ctx.fillStyle = rgba(th.surface, 0.96);
  ctx.fill();
  ctx.strokeStyle = th.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  let y = top + 16;
  ctx.textAlign = 'left';
  for (const line of lines) {
    setFont(ctx, line.bold ? 600 : 500, 10.5);
    ctx.fillStyle = line.muted ? th.muted : th.ink;
    ctx.fillText(line.text, bx + 10, y);
    y += 14;
  }
  if (v.contextPct !== undefined) {
    const w = DETAIL_W - 20;
    ctx.fillStyle = th.line;
    ctx.fillRect(bx + 10, y - 6, w, 4);
    ctx.fillStyle = v.contextPct >= 90 ? th.amberInk : th.muted;
    ctx.fillRect(bx + 10, y - 6, (w * Math.min(100, v.contextPct)) / 100, 4);
  }
  return { x: bx, y: top, w: DETAIL_W, h };
}

function detailLines(
  ctx: CanvasRenderingContext2D,
  v: AgentView,
): Array<{ text: string; bold?: boolean; muted?: boolean }> {
  const out: Array<{ text: string; bold?: boolean; muted?: boolean }> = [];
  if (v.tasks.length > 0) {
    const done = v.tasks.filter((t) => t.status === 'completed').length;
    out.push({ text: `Tareas ${done} de ${v.tasks.length}`, bold: true });
    for (const t of v.tasks.slice(0, DETAIL_TASKS)) {
      const mark = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '·';
      out.push({ text: fit(ctx, `${mark} ${t.subject}`), muted: t.status === 'completed' });
    }
    if (v.tasks.length > DETAIL_TASKS) {
      out.push({ text: `y ${v.tasks.length - DETAIL_TASKS} más`, muted: true });
    }
  }
  if (v.lastReplyHead) {
    out.push({ text: 'Último mensaje', bold: true });
    for (const l of wrap(ctx, v.lastReplyHead, 2)) out.push({ text: l, muted: true });
  }
  if (v.contextPct !== undefined) out.push({ text: `Contexto ${v.contextPct}%`, bold: true });
  return out;
}

function fit(ctx: CanvasRenderingContext2D, text: string): string {
  setFont(ctx, 500, 10.5);
  const max = DETAIL_W - 20;
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxLines: number): string[] {
  setFont(ctx, 500, 10.5);
  const max = DETAIL_W - 20;
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > max && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) lines[maxLines - 1] = fit(ctx, lines[maxLines - 1] + ' …');
  return lines;
}

/** A sleeping "z" drifting up and fading (one every few seconds). */
export function drawZ(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  t: number,
) {
  const p = (t % 7) / 7;
  if (p > 0.6) return;
  const k = p / 0.6;
  ctx.save();
  ctx.globalAlpha *= 1 - k;
  setFont(ctx, 600, 11 + k * 3);
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.fillText('z', x + 6 + k * 8, y - k * 16);
  ctx.restore();
}

/** The celebrating agent's own colours: its body, lighter and darker. */
export function sparkColors(color: string): string[] {
  return [color, lighten(color, 0.35), darker(color, 0.22), lighten(color, 0.65)];
}

/** Confetti burst at progress p (0..1): bits fly up and fall, in `colors`. */
export function drawConfetti(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: number,
  seed: number,
  colors: readonly string[],
) {
  const n = 22;
  const base = ctx.globalAlpha;
  for (let i = 0; i < n; i++) {
    const a = ((i * 137.5 + seed * 31) % 360) * (Math.PI / 180);
    const speed = 50 + ((i * 53 + seed) % 40);
    const px = x + Math.cos(a) * speed * p;
    const py = y - Math.abs(Math.sin(a)) * speed * p * 1.2 + 90 * p * p;
    ctx.globalAlpha = base * (1 - p);
    ctx.fillStyle = colors[i % colors.length];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + p * 6);
    ctx.fillRect(-2.5, -1.5, 5, 3);
    ctx.restore();
  }
  ctx.globalAlpha = base;
}

const TAU = Math.PI * 2;

/** One heart, its point at the bottom, centred on (x, y). */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
  ctx.fill();
}

/** The "hearts" trick: a few hearts float up from his head and fade. */
export function drawHearts(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  head: number,
  p: number,
) {
  const base = ctx.globalAlpha;
  for (let i = 0; i < 4; i++) {
    const q = p * 1.3 - i * 0.15;
    if (q <= 0 || q >= 1) continue;
    ctx.globalAlpha = base * (1 - q);
    ctx.fillStyle = i % 2 ? lighten(th.accent, 0.3) : th.accent;
    heart(ctx, x + Math.sin(q * 5 + i * 2) * 10 + (i - 1.5) * 6, head - 6 - q * 34, 4 + (i % 2));
  }
  ctx.globalAlpha = base;
}

/** The "dizzy" trick: little stars circling over his head. */
export function drawDizzy(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  head: number,
  p: number,
) {
  ctx.save();
  ctx.globalAlpha *= p < 0.8 ? 1 : (1 - p) / 0.2;
  ctx.fillStyle = th.amber;
  for (let i = 0; i < 3; i++) {
    const a = p * TAU * 2 + (i * TAU) / 3;
    const sx = x + Math.cos(a) * 12;
    const sy = head - 6 + Math.sin(a) * 3.5;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const r = k % 2 ? 1.4 : 3.6;
      const b = (k * Math.PI) / 4 - Math.PI / 2;
      if (k === 0) ctx.moveTo(sx + Math.cos(b) * r, sy + Math.sin(b) * r);
      else ctx.lineTo(sx + Math.cos(b) * r, sy + Math.sin(b) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A small ✓ rising from a finished task. */
export function drawCheckPop(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  x: number,
  y: number,
  p: number,
) {
  ctx.save();
  ctx.globalAlpha *= p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  drawCheckBadge(ctx, th, x, y - p * 14, 6);
  ctx.restore();
}

/** An arrow on the view's border toward someone waiting off-screen. */
export function drawEdgeArrow(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  at: { x: number; y: number; angle: number },
  name: string,
): Box {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.angle);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fillStyle = th.amber;
  ctx.fill();
  ctx.restore();
  setFont(ctx, 600, 11);
  const w = ctx.measureText(name).width + 14;
  const bx = Math.max(
    4,
    Math.min(at.x - w / 2 - Math.cos(at.angle) * 34, ctx.canvas.clientWidth - w - 4),
  );
  const by = Math.max(4, at.y - 10 - Math.sin(at.angle) * 24);
  ctx.beginPath();
  ctx.roundRect(bx, by, w, 20, 10);
  ctx.fillStyle = th.amberBg;
  ctx.fill();
  ctx.strokeStyle = th.amber;
  ctx.stroke();
  ctx.fillStyle = th.amberInk;
  ctx.textAlign = 'left';
  ctx.fillText(name, bx + 7, by + 14);
  return { x: Math.min(bx, at.x - 12), y: Math.min(by, at.y - 12), w: w + 24, h: 32 };
}

export const MINIMAP = { w: 132, h: 84, margin: 14 };

/** The whole graph in a corner, with the part on screen outlined. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  th: GraphTheme,
  box: Box,
  world: Bounds,
  dots: Array<{ x: number; y: number; color: string; needs: boolean }>,
  view: Bounds,
) {
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 8);
  ctx.fillStyle = rgba(th.surface, 0.94);
  ctx.fill();
  ctx.strokeStyle = th.line2;
  ctx.lineWidth = 1;
  ctx.stroke();
  const sx = (box.w - 12) / Math.max(1, world.maxX - world.minX);
  const sy = (box.h - 12) / Math.max(1, world.maxY - world.minY);
  const s = Math.min(sx, sy);
  const ox = box.x + 6 + (box.w - 12 - (world.maxX - world.minX) * s) / 2;
  const oy = box.y + 6 + (box.h - 12 - (world.maxY - world.minY) * s) / 2;
  const map = (x: number, y: number) => ({
    x: ox + (x - world.minX) * s,
    y: oy + (y - world.minY) * s,
  });
  for (const d of dots) {
    const p = map(d.x, d.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, d.needs ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = d.needs ? th.amber : d.color;
    ctx.fill();
  }
  const a = map(view.minX, view.minY);
  const b = map(view.maxX, view.maxY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.restore();
}

/** World point under a click on the minimap. */
export function minimapToWorld(box: Box, world: Bounds, x: number, y: number) {
  const sx = (box.w - 12) / Math.max(1, world.maxX - world.minX);
  const sy = (box.h - 12) / Math.max(1, world.maxY - world.minY);
  const s = Math.min(sx, sy);
  const ox = box.x + 6 + (box.w - 12 - (world.maxX - world.minX) * s) / 2;
  const oy = box.y + 6 + (box.h - 12 - (world.maxY - world.minY) * s) / 2;
  return { x: world.minX + (x - ox) / s, y: world.minY + (y - oy) / s };
}
