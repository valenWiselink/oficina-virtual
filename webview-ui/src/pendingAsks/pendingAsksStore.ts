import { useSyncExternalStore } from 'react';

import type { PendingAsksList } from '../../../core/src/messages.js';
import { allYourTurnsDone, markYourTurnDone } from '../identity/yourTurnStore.js';
import { transport } from '../transport/index.js';
import { readPendingAsksMessage } from './pendingAsksView.js';

/**
 * What is pending of you, as the office last sent it. Null until the first
 * message: an office that never sends one (read-only, older server) has no button.
 */
let current: PendingAsksList | null = null;
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  const next = readPendingAsksMessage(msg as unknown as Record<string, unknown>);
  if (!next) return;
  // The first news of each connection: what this browser marked «Hecho» on its
  // own, so the office never brings back an ask you already handled.
  if (!current) transport.send({ type: 'markYourTurnsDone', ids: [...allYourTurnsDone()] });
  // Closed here, by Jarvis or by its PR: the card and the visor stop asking too.
  for (const ask of next.closed) for (const turnId of ask.turnIds ?? []) markYourTurnDone(turnId);
  current = next;
  for (const listener of listeners) listener();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingAsks(): PendingAsksList | null {
  return useSyncExternalStore(subscribe, () => current);
}

export function closePendingAsk(id: string): void {
  transport.send({ type: 'closePendingAsk', id });
}

export function reopenPendingAsk(id: string): void {
  transport.send({ type: 'reopenPendingAsk', id });
}
