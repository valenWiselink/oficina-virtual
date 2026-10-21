import type { Pt } from './graphCamera.js';

/**
 * Where a Clawd's eyes go (one pixel, never more): the pointer when you move
 * it near, "Vos" while it waits on you, and whoever is celebrating. Pure:
 * the scene asks per Clawd, after calm mode had its say (calm: none of it).
 */

/** How near the pointer has to come (screen px), and how long after the
 *  last move the eyes keep following it. */
export const GAZE_NEAR_PX = 200;
export const GAZE_HOLD_MS = 2000;

export interface GazeContext {
  /** The pointer in world coords, only while it moved in the last 2 s. */
  pointer: Pt | null;
  /** GAZE_NEAR_PX in world px at this zoom. */
  near: number;
  /** Someone celebrating right now, and where. */
  celebrant: { id: number; at: Pt } | null;
  vos: Pt;
}

/** One pixel of eyes toward a point: each axis -1, 0 or 1. */
export function lookToward(from: Pt, to: Pt): { dx: number; dy: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { dx: 0, dy: 0 };
  const axis = (u: number) => (Math.abs(u) > 0.38 ? Math.sign(u) : 0);
  return { dx: axis(dx / len), dy: axis(dy / len) };
}

/** What this Clawd looks at, or null (its own business). The others turn to
 *  whoever celebrates; then the pointer, if near; then "Vos", if it waits. */
export function gazeTarget(
  ctx: GazeContext,
  self: { id: number; at: Pt; waits: boolean },
): Pt | null {
  if (ctx.celebrant && ctx.celebrant.id !== self.id) return ctx.celebrant.at;
  const p = ctx.pointer;
  if (p && Math.hypot(p.x - self.at.x, p.y - self.at.y) <= ctx.near) return p;
  return self.waits ? ctx.vos : null;
}
