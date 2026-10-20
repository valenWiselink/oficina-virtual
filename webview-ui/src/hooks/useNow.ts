import { useSyncExternalStore } from 'react';

/** How often the shared clock ticks ("hace N min" needs no finer). */
const TICK_MS = 15_000;

/**
 * One wall clock for the whole page, read during render without calling
 * Date.now() there (render must stay pure): it ticks while anyone listens.
 */
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
