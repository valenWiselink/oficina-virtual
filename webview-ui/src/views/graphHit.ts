import { type Camera, type Pt, toWorld } from './graphCamera.js';

/**
 * What is under a point of the graph: pure, so every target is testable
 * without a canvas. The scene (graphScene.ts) reports what it drew; this
 * decides which of it a click, a drag or the mouse is on.
 */

export type Box = { x: number; y: number; w: number; h: number };
export interface Disc {
  x: number;
  y: number;
  r: number;
}

/** An agent's disc and label. A meeting member's hit names it (`member`)
 *  besides its lead (`id`, whose panel it opens). */
export interface Hit {
  id: number;
  member?: number;
  disc: Disc;
  label?: Box;
}

/** Drawn things a click must not treat as the background (it would close
 *  the panel): the library, file-pass chips, the supervisor's pills and
 *  every line. World coords. */
export interface Passive {
  boxes: Box[];
  circles: Disc[];
  segments: Array<[Pt, Pt]>;
}

export interface HitScene {
  hits: Hit[];
  /** "Vos", world coords. */
  vos: Box;
  /** Off-screen waits: arrow boxes in screen coords. */
  arrows: Array<{ id: number; box: Box }>;
  /** Request pills on the lines to "Vos" (world coords), by agent. */
  pills: Array<{ id: number; box: Box }>;
  passive: Passive;
}

export type GraphTarget =
  | { type: 'agent'; id: number; member?: number }
  | { type: 'vos' }
  | { type: 'pill'; id: number }
  | { type: 'arrow'; id: number }
  | { type: 'minimap' }
  | { type: 'passive' };

/** Slack around a disc (world px) and around a line (screen px). */
const DISC_SLOP = 6;
const LINE_SLOP_PX = 5;

export const inBox = (b: Box | null | undefined, x: number, y: number): boolean =>
  !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Distance from p to the segment a–b. */
export function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}

/** The agent (or member) whose disc or label covers a world point. */
export function agentAt(hits: readonly Hit[], w: Pt): GraphTarget | null {
  for (const hit of hits) {
    const onDisc = Math.hypot(hit.disc.x - w.x, hit.disc.y - w.y) <= hit.disc.r + DISC_SLOP;
    if (onDisc || inBox(hit.label, w.x, w.y)) {
      return hit.member === undefined
        ? { type: 'agent', id: hit.id }
        : { type: 'agent', id: hit.id, member: hit.member };
    }
  }
  return null;
}

function onPassive(passive: Passive, w: Pt, lineSlop: number): boolean {
  return (
    passive.boxes.some((b) => inBox(b, w.x, w.y)) ||
    passive.circles.some((c) => Math.hypot(c.x - w.x, c.y - w.y) <= c.r) ||
    passive.segments.some(([a, b]) => segmentDistance(w, a, b) <= lineSlop)
  );
}

/**
 * The target under a screen point, topmost first: the border arrows and the
 * minimap (screen overlays), "Vos", agents and members, request pills, then
 * anything else drawn. null = the background.
 */
export function hitTest(
  scene: HitScene,
  cam: Camera,
  p: Pt,
  minimap: Box | null,
): GraphTarget | null {
  const arrow = scene.arrows.find((a) => inBox(a.box, p.x, p.y));
  if (arrow) return { type: 'arrow', id: arrow.id };
  if (inBox(minimap, p.x, p.y)) return { type: 'minimap' };
  const w = toWorld(cam, p);
  if (inBox(scene.vos, w.x, w.y)) return { type: 'vos' };
  const agent = agentAt(scene.hits, w);
  if (agent) return agent;
  const pill = scene.pills.find((x) => inBox(x.box, w.x, w.y));
  if (pill) return { type: 'pill', id: pill.id };
  return onPassive(scene.passive, w, LINE_SLOP_PX / cam.zoom) ? { type: 'passive' } : null;
}

/** One string per target ("agent:3:-7"), to tell two apart (the hover's
 *  dwell, the double click); '' for the background. */
export function targetKey(t: GraphTarget | null): string {
  if (!t) return '';
  const id = 'id' in t ? t.id : '';
  const member = 'member' in t && t.member !== undefined ? t.member : '';
  return `${t.type}:${id}:${member}`;
}
