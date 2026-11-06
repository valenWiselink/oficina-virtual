import { useSyncExternalStore } from 'react';

import { useWorkspaces } from './workspaceStore.js';

/**
 * Ajustes → «Espacios de trabajo»: off, the tabs and every «Mover a…» go and
 * the office shows everyone, as «Todos». The workspaces themselves stay saved
 * for when it is turned back on (asked 2026-11-06 by someone who no longer
 * used them). On by default, remembered in this browser.
 */
const KEY = 'oficina.espaciosVisibles';
const listeners = new Set<() => void>();

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

let on = stored();

export function workspacesOn(): boolean {
  return on;
}

export function setWorkspacesOn(next: boolean): void {
  on = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkspacesOn(): boolean {
  return useSyncExternalStore(subscribe, workspacesOn);
}

/** «Mover a…» makes sense only with the tabs on and somewhere to move to. */
export function useOffersMove(): boolean {
  const shown = useWorkspacesOn();
  return useWorkspaces().workspaces.length > 0 && shown;
}
