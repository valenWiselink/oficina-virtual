import { useSyncExternalStore } from 'react';

import { readSidePanel, type SidePanel } from './sideDockRules.js';

/** The panel open in the office's left column, remembered in this browser. */
const KEY = 'oficina.panelLateral';

let open: SidePanel | null = recall();
const listeners = new Set<() => void>();

function recall(): SidePanel | null {
  try {
    return readSidePanel(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setSidePanel(next: SidePanel | null): void {
  if (next === open) return;
  open = next;
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidePanel(): SidePanel | null {
  return useSyncExternalStore(subscribe, () => open);
}
