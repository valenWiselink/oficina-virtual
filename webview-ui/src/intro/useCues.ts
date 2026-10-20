import { useEffect } from 'react';

import { type Cue, cue } from './introSound.js';

/** [ms after the scene starts, cue, pitch variant]. */
export type CueAt = readonly [number, Cue, number?];

/** Play a scene's sounds in time with its animation (pass a module constant). */
export function useCues(cues: readonly CueAt[]): void {
  useEffect(() => {
    const timers = cues.map(([ms, name, variant]) => setTimeout(() => cue(name, variant), ms));
    return () => timers.forEach(clearTimeout);
  }, [cues]);
}

/** One cue every `stepMs` from `fromMs`, `count` times (footsteps, key taps). */
export function cueRun(name: Cue, fromMs: number, stepMs: number, count: number): CueAt[] {
  return Array.from({ length: count }, (_, i) => [fromMs + i * stepMs, name, i] as const);
}
