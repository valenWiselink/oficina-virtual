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
  if (!current)
    transport.send({ type: 'markYourTurnsDone', ids: [...allYourTurnsDone()], sync: true });
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

/** «Sigue pendiente»: it only looked done. */
export function keepPendingAsk(id: string): void {
  transport.send({ type: 'keepPendingAsk', id });
}

/** «Más tarde»: out of «Ahora» for `minutes`. */
export function snoozePendingAsk(id: string, minutes: number): void {
  transport.send({ type: 'snoozePendingAsk', id, minutes });
}

/** «Posponer» until a moment (ms): «mañana a la mañana», after a meeting. */
export function snoozePendingAskUntil(id: string, until: number): void {
  transport.send({ type: 'snoozePendingAsk', id, until });
}

/** How a «Mergear» goes: under way, or what gh said. */
export type MergeState = { busy: true } | { busy: false; ok: boolean; message: string };

let merges: ReadonlyMap<string, MergeState> = new Map();
const mergeListeners = new Set<() => void>();

function setMerge(id: string, state: MergeState): void {
  merges = new Map(merges).set(id, state);
  for (const l of mergeListeners) l();
}

transport.onMessage((msg) => {
  const m = msg as unknown as Record<string, unknown>;
  if (m.type !== 'pendingAskMerge' || typeof m.id !== 'string') return;
  setMerge(m.id, { busy: false, ok: m.ok === true, message: String(m.message ?? '') });
});

/** Valentín's click: the office runs `gh pr merge` on the ask's PR. */
export function mergePendingAsk(id: string): void {
  setMerge(id, { busy: true });
  transport.send({ type: 'mergePendingAsk', id });
}

function subscribeMerges(listener: () => void): () => void {
  mergeListeners.add(listener);
  return () => mergeListeners.delete(listener);
}

export function useMergeState(id: string): MergeState | undefined {
  return useSyncExternalStore(subscribeMerges, () => merges.get(id));
}
