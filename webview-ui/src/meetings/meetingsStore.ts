import { useSyncExternalStore } from 'react';

import type { UpcomingMeetings } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { readMeetingsMessage } from './meetingsView.js';

/**
 * The meetings as the office last sent them, whether this browser keeps the
 * list closed and what it dismissed. Null until the first message: an office
 * that never sends one (read-only, older server) shows nothing.
 */
const MINIMIZED_KEY = 'oficina.reunionesMinimizado';
const DISMISSED_KEY = 'oficina.reunionesDescartadas';
const DISMISSED_MAX = 50;

let current: UpcomingMeetings | null = null;
let minimized = readMinimized();
let dismissed = readDismissed();
const listeners = new Set<() => void>();

function readMinimized(): boolean {
  try {
    return localStorage.getItem(MINIMIZED_KEY) === '1';
  } catch {
    return false;
  }
}

function readDismissed(): readonly string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function notify(): void {
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  const next = readMeetingsMessage(msg as unknown as Record<string, unknown>);
  if (!next) return;
  current = next;
  notify();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpcomingMeetings(): UpcomingMeetings | null {
  return useSyncExternalStore(subscribe, () => current);
}

export function useMeetingsMinimized(): boolean {
  return useSyncExternalStore(subscribe, () => minimized);
}

export function useDismissedMeetings(): readonly string[] {
  return useSyncExternalStore(subscribe, () => dismissed);
}

/** «Ya sé»: it stops being painted (it stays in the chip and the list). */
export function dismissMeeting(key: string): void {
  if (dismissed.includes(key)) return;
  dismissed = [...dismissed, key].slice(-DISMISSED_MAX);
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    // Remembering it is a convenience.
  }
  notify();
}

/**
 * Open by hand in an office too narrow for the list to stay by itself: it
 * shows until closed, and is not remembered (the next narrow office starts
 * without it).
 */
let peek = false;

export function useMeetingsPeek(): boolean {
  return useSyncExternalStore(subscribe, () => peek);
}

export function setMeetingsPeek(next: boolean): void {
  if (next === peek) return;
  peek = next;
  notify();
}

/** The list's own ✕: a peek just ends; otherwise the list stays closed. */
export function closeMeetingsList(): void {
  if (peek) setMeetingsPeek(false);
  else setMeetingsMinimized(true);
}

export function setMeetingsMinimized(next: boolean): void {
  minimized = next;
  try {
    localStorage.setItem(MINIMIZED_KEY, next ? '1' : '0');
  } catch {
    // Remembering it is a convenience.
  }
  notify();
}
