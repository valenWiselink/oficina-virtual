import { useSyncExternalStore } from 'react';

import { TRANSPORT_STATE_CONNECTED } from '../../../core/src/constants.js';
import type { HookHealth } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/** The latest failing verdict (null while the hooks work), when it came
 *  (`at`) and when this bad stretch began (`since`). Kept from module load:
 *  the server sends it in the connect replay, before the notice is on screen. */
interface HealthNews {
  status: HookHealth;
  at: number;
  since: number;
}

let latest: HealthNews | null = null;
const listeners = new Set<() => void>();

function set(next: typeof latest): void {
  latest = next;
  for (const listener of listeners) listener();
}

transport.onMessage((msg) => {
  if (msg.type !== 'hookHealth') return;
  const now = Date.now();
  set(msg.failing ? { status: msg, at: now, since: latest?.since ?? now } : null);
});

transport.onStateChange((state) => {
  // The connection indicator speaks then; the server repeats it on reconnect.
  if (state !== TRANSPORT_STATE_CONNECTED && latest) set(null);
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHookHealth(): HealthNews | null {
  return useSyncExternalStore(subscribe, () => latest);
}
