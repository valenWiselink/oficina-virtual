import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';

/**
 * "Claude en castellano" (Ajustes → Agentes): the agents the office launches
 * get Claude Code's spinner verbs ("Atando cabos…") and the office's tips in
 * Spanish (server/src/spinnerSettings.ts). The office owns the setting; this
 * mirrors it (settingsLoaded, then spanishTerminalUpdated) and asks to change it.
 */
let enabled = true;
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  const m = msg as { type: string; spanishTerminal?: unknown; enabled?: unknown };
  const next =
    m.type === 'settingsLoaded'
      ? m.spanishTerminal
      : m.type === 'spanishTerminalUpdated'
        ? m.enabled
        : undefined;
  if (typeof next !== 'boolean' || next === enabled) return;
  enabled = next;
  for (const l of listeners) l();
});

export function setSpanishTerminal(on: boolean): void {
  transport.send({ type: 'setSpanishTerminal', enabled: on });
}

export function useSpanishTerminal(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled,
  );
}
