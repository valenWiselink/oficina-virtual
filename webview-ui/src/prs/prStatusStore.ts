import { useSyncExternalStore } from 'react';

import type { PrStatus } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { applyPrMessage } from './prStatus.js';

export type { PrStatus };

/** Live store over applyPrMessage (prStatus.ts). */
let statuses: ReadonlyMap<string, PrStatus> = new Map();
const listeners = new Set<() => void>();
const mergeListeners = new Set<(url: string) => void>();

transport.onMessage((msg) => {
  const result = applyPrMessage(statuses, msg as unknown as Record<string, unknown>);
  if (!result) return;
  statuses = result.next;
  for (const l of listeners) l();
  for (const url of result.merged) for (const l of mergeListeners) l(url);
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every known PR status by URL, re-rendering when any changes. */
export function usePrStatuses(): ReadonlyMap<string, PrStatus> {
  return useSyncExternalStore(subscribe, () => statuses);
}

export function prStatusOf(url: string): PrStatus | undefined {
  return statuses.get(url);
}

/** Called when a PR turns merged while the office is open. */
export function onPrMerged(listener: (url: string) => void): () => void {
  mergeListeners.add(listener);
  return () => mergeListeners.delete(listener);
}
