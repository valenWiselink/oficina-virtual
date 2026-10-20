/**
 * The graph's bubbles floating, so the office never looks frozen: pure (the
 * scene applies it to what it draws, never to the simulation).
 */

/** How far a bubble floats up and down (world px), and its slowest and
 *  fastest round trip: each gets its own, so they never bob in step. */
const FLOAT_PX = 3;
const FLOAT_MIN_S = 3.2;
const FLOAT_SPREAD_S = 1.6;

/** A node's float right now: a slow sine with a phase and pace of its own. */
export function floatOffset(id: string, t: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const period = FLOAT_MIN_S + ((h % 97) / 97) * FLOAT_SPREAD_S;
  const phase = ((h >>> 7) % 360) * (Math.PI / 180);
  return Math.sin((t / period) * 2 * Math.PI + phase) * FLOAT_PX;
}
