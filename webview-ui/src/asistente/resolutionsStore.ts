import { useSyncExternalStore } from 'react';

import type { AskResolutionEntry } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/**
 * How Jarvis took what Valentín said about several asks at once
 * (resolver_pendientes), as the office sends it: each with «Deshacer» until
 * it applies, a merge waiting for the held button.
 */

let items: readonly AskResolutionEntry[] = [];
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  if (msg.type !== 'askResolutions' || !Array.isArray(msg.items)) return;
  items = msg.items as AskResolutionEntry[];
  for (const l of listeners) l();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAskResolutions(): readonly AskResolutionEntry[] {
  return useSyncExternalStore(subscribe, () => items);
}

/** «Deshacer»: it is not applied, and Jarvis hears it. */
export function undoAskResolution(key: string): void {
  transport.send({ type: 'undoAskResolution', key });
}
