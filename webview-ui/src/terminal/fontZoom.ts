import { useSyncExternalStore } from 'react';

import { TERMINAL_FONT_SIZE_PX } from '../constants.js';

/** One font size for every desktop terminal, remembered in this browser. */
const KEY = 'oficina.terminalLetra';
export const TERMINAL_FONT_MIN_PX = 9;
export const TERMINAL_FONT_MAX_PX = 24;

let size = recall();
const listeners = new Set<() => void>();

function recall(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= TERMINAL_FONT_MIN_PX && n <= TERMINAL_FONT_MAX_PX
      ? n
      : TERMINAL_FONT_SIZE_PX;
  } catch {
    return TERMINAL_FONT_SIZE_PX;
  }
}

export function terminalFontSize(): number {
  return size;
}

/** Change it by `step` px (0 = back to the default), clamped. */
export function zoomTerminalFont(step: number): number {
  const next =
    step === 0
      ? TERMINAL_FONT_SIZE_PX
      : Math.min(TERMINAL_FONT_MAX_PX, Math.max(TERMINAL_FONT_MIN_PX, size + step));
  if (next === size) return size;
  size = next;
  try {
    localStorage.setItem(KEY, String(size));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
  return size;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current terminal font size, re-rendering when it changes. */
export function useTerminalFontSize(): number {
  return useSyncExternalStore(subscribe, terminalFontSize);
}
