import { useSyncExternalStore } from 'react';

import type { UpcomingMeetings } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { readMeetingsMessage } from './meetingsView.js';

/**
 * The meetings as the office last sent them, and whether this browser keeps
 * the panel minimized. Null until the first message: an office that never
 * sends one (read-only, older server) has no panel.
 */
const MINIMIZED_KEY = 'oficina.reunionesMinimizado';

let current: UpcomingMeetings | null = null;
let minimized = readMinimized();
const listeners = new Set<() => void>();

function readMinimized(): boolean {
  try {
    return localStorage.getItem(MINIMIZED_KEY) === '1';
  } catch {
    return false;
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

/**
 * The room the board leaves for the panel, so it never covers the first
 * column: its width while open, the rail's when minimized or narrow (the
 * office region is the @container).
 */
export function useMeetingsInset(): string {
  const msg = useUpcomingMeetings();
  const isMinimized = useMeetingsMinimized();
  if (!msg?.connected) return '';
  return isMinimized ? 'pl-44' : 'pl-44 @min-[760px]:pl-[238px]';
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
