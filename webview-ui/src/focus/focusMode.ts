import { useSyncExternalStore } from 'react';

/**
 * "Modo foco": for a while (25 min by default) the office stays quiet about
 * what is not urgent — no "plin" when an agent finishes, no Windows notice
 * for a wait — while permissions still sound and notify (they block an
 * agent). What it kept quiet is counted, and told when the focus ends.
 * Remembered in this browser, so a reload keeps the session going.
 */
export const DEFAULT_FOCUS_MIN = 25;

export type MissedKind = 'termino' | 'tetoca';

export interface FocusState {
  active: boolean;
  /** When it ends (ms), while active. */
  endsAt?: number;
  /** What happened while it lasted (the summary after it ends). */
  missed: Record<MissedKind, number>;
  /** Set when a focus ended and its summary was not dismissed yet. */
  ended: boolean;
}

const KEY = 'oficina.foco';
const NONE: Record<MissedKind, number> = { termino: 0, tetoca: 0 };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

let state: FocusState = recall();
schedule();

function recall(): FocusState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FocusState> | null;
    if (!raw) return { active: false, missed: { ...NONE }, ended: false };
    return {
      active: !!raw.active,
      endsAt: typeof raw.endsAt === 'number' ? raw.endsAt : undefined,
      missed: { ...NONE, ...raw.missed },
      ended: !!raw.ended,
    };
  } catch {
    return { active: false, missed: { ...NONE }, ended: false };
  }
}

function set(next: FocusState): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  schedule();
  for (const l of listeners) l();
}

/** End the focus by itself when its time comes (also after a reload). */
function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!state.active || state.endsAt === undefined) return;
  const left = state.endsAt - Date.now();
  if (left <= 0) queueMicrotask(endFocus);
  else timer = setTimeout(endFocus, left);
}

export function startFocus(minutes = DEFAULT_FOCUS_MIN): void {
  set({
    active: true,
    endsAt: Date.now() + minutes * 60_000,
    missed: { ...NONE },
    ended: false,
  });
}

/** Stop it (by hand or on time): the summary shows what it kept quiet. */
export function endFocus(): void {
  if (!state.active) return;
  set({ active: false, missed: state.missed, ended: true });
}

/** Dismiss the summary after a focus. */
export function dismissFocusSummary(): void {
  set({ active: false, missed: { ...NONE }, ended: false });
}

export function isFocused(): boolean {
  return state.active;
}

/** Something happened that the focus kept quiet (counted for the summary). */
export function noteWhileFocused(kind: MissedKind): void {
  if (!state.active) return;
  set({ ...state, missed: { ...state.missed, [kind]: state.missed[kind] + 1 } });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFocus(): FocusState {
  return useSyncExternalStore(subscribe, () => state);
}

/** "3 agentes terminaron mientras tanto": the summary line, or a calm one. */
export function missedSummary(missed: Record<MissedKind, number>): string {
  const parts: string[] = [];
  if (missed.termino > 0) {
    parts.push(missed.termino === 1 ? '1 agente terminó' : `${missed.termino} agentes terminaron`);
  }
  if (missed.tetoca > 0) {
    parts.push(missed.tetoca === 1 ? '1 te dejó algo' : `${missed.tetoca} te dejaron algo`);
  }
  return parts.length === 0
    ? 'No pasó nada mientras tanto.'
    : `${parts.join(' y ')} mientras tanto.`;
}

/** Whole minutes left, for the pill: rounded (the page clock can lag a few
 *  seconds, and rounding up showed "26 min" on a fresh 25), never 0 while on. */
export function minutesLeft(endsAt: number, now: number): number {
  const ms = endsAt - now;
  return ms <= 0 ? 0 : Math.max(1, Math.round(ms / 60_000));
}
