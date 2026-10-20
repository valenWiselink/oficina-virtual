import { useSyncExternalStore } from 'react';

/**
 * What each Clawd wears, chosen by you on its card and remembered in this
 * browser by the agent's key (its name, like the graph's pins), so it keeps
 * it across restarts. Drawn on the graph and over the board's mug shot.
 * An activity accessory (glasses, wrench, coffee) shows instead while it applies.
 */
export type Outfit = 'none' | 'cap' | 'bow' | 'crown' | 'headphones';

export const OUTFITS: ReadonlyArray<{ id: Outfit; label: string }> = [
  { id: 'none', label: 'Nada' },
  { id: 'cap', label: 'Gorra' },
  { id: 'bow', label: 'Moño' },
  { id: 'crown', label: 'Corona' },
  { id: 'headphones', label: 'Auriculares' },
];

const KEY = 'oficina.atuendos';

let outfits: Readonly<Record<string, Outfit>> = recall();
const listeners = new Set<() => void>();

function recall(): Record<string, Outfit> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, Outfit> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (OUTFITS.some((o) => o.id === v)) out[k] = v as Outfit;
    }
    return out;
  } catch {
    return {};
  }
}

/** The outfit of an agent (by its key), for the canvas. */
export function outfitOf(agentKey: string): Outfit {
  return outfits[agentKey] ?? 'none';
}

export function setOutfit(agentKey: string, outfit: Outfit): void {
  const next = { ...outfits };
  if (outfit === 'none') delete next[agentKey];
  else next[agentKey] = outfit;
  outfits = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(outfits));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** An agent's outfit, re-rendering when any changes. */
export function useOutfit(agentKey: string): Outfit {
  return useSyncExternalStore(subscribe, () => outfits[agentKey] ?? 'none');
}
