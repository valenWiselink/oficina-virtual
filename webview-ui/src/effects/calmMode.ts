import { useSyncExternalStore } from 'react';

/**
 * "Modo calma": everything decorative off (sleeping z's, confetti, hops,
 * breathing, the background following the hour) — what shows a state stays.
 * On by itself when the system asks for reduced motion; otherwise the
 * operator's choice, remembered in this browser.
 */
const KEY = 'oficina.calma';
const listeners = new Set<() => void>();

function systemReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

let calm = stored() ?? systemReducedMotion();

export function isCalm(): boolean {
  return calm;
}

export function setCalm(next: boolean): void {
  calm = next;
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

export function useCalmMode(): boolean {
  return useSyncExternalStore(subscribe, isCalm);
}
