import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';
import { readLimitsMessage, type UsageLimits } from './usageLimits.js';

/**
 * The plan's usage limits as the office last sent them (`usageLimits`, on
 * connect and whenever they change). Null until the first message: an
 * office that never sends one (read-only, older server) shows no meter.
 */
let current: UsageLimits | null = null;
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  const next = readLimitsMessage(msg as unknown as Record<string, unknown>);
  if (!next) return;
  current = next;
  for (const l of listeners) l();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUsageLimits(): UsageLimits | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** Install or remove the office's status line (the source of the numbers). */
export function setUsageLimitsEnabled(enabled: boolean): void {
  transport.send({ type: 'setUsageLimits', enabled });
}
