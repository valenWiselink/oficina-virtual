import { useSyncExternalStore } from 'react';

import type { WriteDaySummary } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/**
 * "Escribirlo como resumen": today's summary by Haiku as the server keeps it
 * (the saved one on connect, a new one when written), whether it is being
 * written, and why the last try failed.
 */
export interface DaySummaryState {
  text?: string;
  at?: number;
  writing: boolean;
  failed?: string;
}

let state: DaySummaryState = { writing: false };
const listeners = new Set<() => void>();

function set(next: DaySummaryState): void {
  state = next;
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  if (msg.type === 'daySummary') {
    set({ text: String(msg.text ?? ''), at: Number(msg.at), writing: false });
  } else if (msg.type === 'daySummaryFailed') {
    set({ ...state, writing: false, failed: String(msg.reason ?? 'No se pudo escribir') });
  }
});

/** Ask Claude to write it from what the day says was achieved. */
export function writeDaySummary(facts: Omit<WriteDaySummary, 'type'>): void {
  if (state.writing) return;
  set({ ...state, writing: true, failed: undefined });
  transport.send({ type: 'writeDaySummary', ...facts });
}

export function useDaySummary(): DaySummaryState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
