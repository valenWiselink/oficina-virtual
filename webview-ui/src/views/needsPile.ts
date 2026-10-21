import { useEffect, useSyncExternalStore } from 'react';

import type { AgentView } from './agentViews.js';

/**
 * «Al día»: the office notices when you clear a pile of "Te necesita". From
 * 3 or more waiting down to none, each one answered by you (an approval, an
 * answer, «Hecho» — an agent you closed does not count), and empty for 5 s:
 * the column says so for 10 min. At most once every 30 min. It never counts
 * how many or how fast (that would push to approve without reading).
 */

export const PILE_MIN = 3;
export const SETTLE_MS = 5_000;
export const ACHIEVED_SHOWN_MS = 10 * 60_000;
export const ACHIEVED_EVERY_MS = 30 * 60_000;

export interface PileState {
  /** Who was in "Te necesita" at the last look. */
  waiting: number[];
  /** Since the column last settled empty: the most at once, and how many
   *  left it answered (still in the office). */
  peak: number;
  answered: number;
  /** When it last went empty (undefined while someone waits). */
  emptySince?: number;
  /** When «Al día» was last earned. */
  earnedAt?: number;
}

export const EMPTY_PILE: PileState = { waiting: [], peak: 0, answered: 0 };

/** One look at the office: who waits now and who is still in it. Pure. */
export function trackPile(
  state: PileState,
  waiting: readonly number[],
  present: ReadonlySet<number>,
  now: number,
): PileState {
  const stillWaiting = new Set(waiting);
  const answered =
    state.answered + state.waiting.filter((id) => !stillWaiting.has(id) && present.has(id)).length;
  if (waiting.length > 0) {
    return {
      ...state,
      waiting: [...waiting],
      peak: Math.max(state.peak, waiting.length),
      answered,
      emptySince: undefined,
    };
  }
  const emptySince = state.emptySince ?? now;
  const next: PileState = { ...state, waiting: [], answered, emptySince };
  if (now - emptySince < SETTLE_MS) return next;
  // Settled empty: the stretch is over, earned or not.
  const earned =
    next.peak >= PILE_MIN &&
    next.answered >= PILE_MIN &&
    (state.earnedAt === undefined || now - state.earnedAt >= ACHIEVED_EVERY_MS);
  return { ...next, peak: 0, answered: 0, earnedAt: earned ? now : state.earnedAt };
}

/** Whether «Al día» shows now. */
export function achievedNow(state: PileState, now: number): boolean {
  return (
    state.earnedAt !== undefined &&
    now - state.earnedAt < ACHIEVED_SHOWN_MS &&
    state.waiting.length === 0
  );
}

const LINES = [
  'Al día. Ni uno esperando.',
  'Limpito. Volvé a lo tuyo.',
  'Al día: todo atendido.',
  'Nadie esperando. Bien ahí.',
];

/** The line for one «Al día» (the same for its 10 min, another next time). */
export function achievedLine(earnedAt: number): string {
  return LINES[Math.floor(earnedAt / ACHIEVED_EVERY_MS) % LINES.length];
}

let state: PileState = EMPTY_PILE;
const listeners = new Set<() => void>();

function look(views: readonly AgentView[], now: number): void {
  const waiting = views.filter((v) => v.kind === 'needs').map((v) => v.id);
  const next = trackPile(state, waiting, new Set(views.map((v) => v.id)), now);
  const changed = next.earnedAt !== state.earnedAt || next.waiting.length !== state.waiting.length;
  state = next;
  if (changed) for (const l of listeners) l();
}

/** Watch every agent (all workspaces): mounted once, by DayKeeper. */
export function useTrackPile(views: readonly AgentView[]): void {
  useEffect(() => {
    look(views, Date.now());
    if (state.waiting.length > 0 || state.emptySince === undefined) return;
    // Empty now: look again once it has been empty long enough.
    const timer = setTimeout(() => look(views, Date.now()), SETTLE_MS + 50);
    return () => clearTimeout(timer);
  }, [views]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The «Al día» line while it shows (`now`: the page clock). */
export function useAchieved(now: number): string | undefined {
  const s = useSyncExternalStore(subscribe, () => state);
  return achievedNow(s, now) && s.earnedAt !== undefined ? achievedLine(s.earnedAt) : undefined;
}
