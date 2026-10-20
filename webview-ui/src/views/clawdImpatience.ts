/** A wait on you this long and his Clawd starts to fidget. */
export const IMPATIENT_AFTER_MS = 10 * 60_000;
/** Foot taps per second. */
const TAPS_PER_S = 3;
/** Every this many seconds he glances at his watch… */
const WATCH_EVERY_S = 6;
/** …for this long. */
const WATCH_FOR_S = 1.2;

export interface Impatience {
  /** The front foot is up this frame (a tap). */
  footUp: boolean;
  /** Left arm up to his eyes, looking at the watch. */
  watch: boolean;
}

/**
 * How an agent waiting on you fidgets: from 10 min on, a quiet foot tap and,
 * every few seconds, a look at his watch. Each agent on its own beat (seed),
 * so a row of them never taps in unison. Null while the wait is shorter.
 */
export function impatience(waitedMs: number, t: number, seed: number): Impatience | null {
  if (waitedMs < IMPATIENT_AFTER_MS) return null;
  const s = t + seed * 1.7;
  const watch = s % WATCH_EVERY_S < WATCH_FOR_S;
  // Still while checking the time; tapping the rest of the cycle.
  return { footUp: !watch && Math.floor(s * TAPS_PER_S * 2) % 2 === 0, watch };
}
