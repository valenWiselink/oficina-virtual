import { useSyncExternalStore } from 'react';

import { isNightHour } from './dayPhase.js';

/**
 * The office's own light or dark look (Ajustes → Tema), remembered in this
 * browser. "Según la hora" turns dark at night. Applied as `data-theme` on
 * <html>, where index.css swaps the color tokens; the graph re-reads them.
 */
export type AppTheme = 'light' | 'dark';
export type AppThemeChoice = 'light' | 'dark' | 'hour';

export const APP_THEME_CHOICES: ReadonlyArray<{ id: AppThemeChoice; label: string }> = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'hour', label: 'Según la hora' },
];

const KEY = 'oficina.tema';
/** How often "Según la hora" re-checks the hour. */
const CHECK_MS = 60_000;

let choice = recall();
let applied = resolve(choice);
const listeners = new Set<() => void>();

function recall(): AppThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return APP_THEME_CHOICES.some((c) => c.id === saved) ? (saved as AppThemeChoice) : 'light';
  } catch {
    return 'light';
  }
}

function resolve(c: AppThemeChoice): AppTheme {
  if (c !== 'hour') return c;
  return isNightHour(new Date().getHours()) ? 'dark' : 'light';
}

function apply(): void {
  const next = resolve(choice);
  document.documentElement.dataset.theme = next;
  if (next === applied) return;
  applied = next;
  for (const l of listeners) l();
}

/** Put the saved theme on the page (main.tsx, before the first render). */
export function initAppTheme(): void {
  document.documentElement.dataset.theme = applied;
  setInterval(apply, CHECK_MS);
}

export function setAppThemeChoice(next: AppThemeChoice): void {
  choice = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* blocked storage: it lasts this tab */
  }
  apply();
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppThemeChoice(): AppThemeChoice {
  return useSyncExternalStore(subscribe, () => choice);
}

/** The theme on screen now, re-rendering when it changes. */
export function useAppTheme(): AppTheme {
  return useSyncExternalStore(subscribe, () => applied);
}
