import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';

/**
 * "Agentes que sobreviven a reinicios" (Ajustes): new agents run as Claude
 * Code background sessions the office attaches to, so restarting or updating
 * the office does not restart them. The office owns the setting; this mirrors
 * it (settingsLoaded, then backgroundAgentsUpdated) and asks to change it.
 */
let enabled = true;
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  const m = msg as { type: string; backgroundAgents?: unknown; enabled?: unknown };
  const next =
    m.type === 'settingsLoaded'
      ? m.backgroundAgents
      : m.type === 'backgroundAgentsUpdated'
        ? m.enabled
        : undefined;
  if (typeof next !== 'boolean' || next === enabled) return;
  enabled = next;
  for (const l of listeners) l();
});

export function setBackgroundAgents(on: boolean): void {
  transport.send({ type: 'setBackgroundAgents', enabled: on });
}

export function useBackgroundAgents(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled,
  );
}
