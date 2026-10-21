import { useSyncExternalStore } from 'react';

/**
 * Answers whose merged PR you already told the agent about with "Avisarle",
 * so the button goes away at once (the agent's reply clears it for good).
 * Keyed by the answer's record id. Kept in this browser across reloads; a
 * blocked storage only makes it last the tab.
 */
const KEY = 'oficina.prAvisado';
const MAX_KEPT = 100;

let told: readonly string[] = load();
const listeners = new Set<() => void>();

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markMergeTold(turnId: string): void {
  if (told.includes(turnId)) return;
  told = [...told, turnId].slice(-MAX_KEPT);
  try {
    localStorage.setItem(KEY, JSON.stringify(told));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether "Avisarle" was already used for this answer. */
export function useMergeTold(turnId: string | undefined): boolean {
  const list = useSyncExternalStore(subscribe, () => told);
  return turnId !== undefined && list.includes(turnId);
}

/** "Avisarle" fits: its PR got merged, nobody told it yet (the office or
 *  you), and it can be written to. */
export function useTellMerged(
  merged: { told: boolean; turnId: string } | undefined,
  writable: boolean,
): boolean {
  const told = useMergeTold(merged?.turnId);
  return writable && !!merged && !merged.told && !told;
}
