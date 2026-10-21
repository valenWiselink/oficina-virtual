import { useSyncExternalStore } from 'react';

import { isFocused } from '../focus/focusMode.js';
import { localDay } from './boardMood.js';

/**
 * Whether you were away, for «Volviste»: the last time you touched the
 * office (a click, a key, the wheel, the mouse over it, the window coming
 * back from the tray or another app) and, when a touch comes after 45 min
 * or more without one, the absence it ends. The desktop app hides to the
 * tray instead of closing, so a hidden page simply goes untouched.
 *
 * Never on the first look of the day (the page loading counts as a touch,
 * and an absence that started on another day is the morning's «ayer: …»),
 * never while the focus mode runs (it has its own «mientras tanto»), and
 * once per absence.
 */

/** No touch for this long is an absence. */
export const AWAY_MS = 45 * 60_000;
/** «Volviste» lasts this long, or until you open a card. */
export const WELCOME_SHOWN_MS = 3 * 60_000;
/** The mouse moving counts at most this often. */
const MOVE_EVERY_MS = 5_000;

export interface Absence {
  from: number;
  to: number;
}

/** The absence a touch at `now` ends, if any (pure). */
export function absenceEnded(lastTouch: number, now: number): Absence | null {
  if (now - lastTouch < AWAY_MS) return null;
  if (localDay(new Date(lastTouch)) !== localDay(new Date(now))) return null;
  return { from: lastTouch, to: now };
}

let lastTouch = Date.now();
let lastMove = 0;
let current: Absence | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function touch(): void {
  const now = Date.now();
  const ended = absenceEnded(lastTouch, now);
  lastTouch = now;
  if (!ended || isFocused()) return;
  current = ended;
  emit();
}

function onMove(): void {
  const now = Date.now();
  if (now - lastMove < MOVE_EVERY_MS) return;
  lastMove = now;
  touch();
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') touch();
}

/** Start listening (once for the page); returns the cleanup. */
export function watchPresence(): () => void {
  if (started) return () => {};
  started = true;
  const opts = { capture: true, passive: true };
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) {
    window.addEventListener(type, touch, opts);
  }
  window.addEventListener('pointermove', onMove, opts);
  window.addEventListener('focus', touch);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    started = false;
    for (const type of ['pointerdown', 'keydown', 'wheel'] as const) {
      window.removeEventListener(type, touch, opts);
    }
    window.removeEventListener('pointermove', onMove, opts);
    window.removeEventListener('focus', touch);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** «Volviste» is done with: you opened a card or pressed «Ver». */
export function dismissAbsence(): void {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The absence you just came back from, while «Volviste» may show (`now`:
 *  the page clock, so it goes by itself after WELCOME_SHOWN_MS). */
export function useAbsence(now: number): Absence | null {
  const absence = useSyncExternalStore(subscribe, () => current);
  return absence && now - absence.to < WELCOME_SHOWN_MS ? absence : null;
}
