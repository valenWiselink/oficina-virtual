import { useSyncExternalStore } from 'react';

/**
 * A sticky note per agent (what you asked it, why you opened it), by the
 * agent's key so it survives restarts. Remembered in this browser.
 */
const KEY = 'oficina.notas';
export const NOTE_MAX_CHARS = 140;

let notes: Readonly<Record<string, string>> = recall();
const listeners = new Set<() => void>();

function recall(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function setNote(agentKey: string, text: string): void {
  const clean = text.trim().slice(0, NOTE_MAX_CHARS);
  const next = { ...notes };
  if (clean) next[agentKey] = clean;
  else delete next[agentKey];
  notes = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNote(agentKey: string): string {
  return useSyncExternalStore(subscribe, () => notes[agentKey] ?? '');
}
