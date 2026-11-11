/**
 * The «Asistente» screen (design C «Momentos», chosen 2026-11-11): the
 * conversation with Jarvis in the middle, what waits on you as cards right
 * above its box, the team on the left, what comes on the right. The screen
 * takes the shape of the moment: «Decidir» shows the cards and both sides,
 * «Escribir» folds everything into the conversation. Pure rules (tested).
 */
import type { DayLogEntry } from '../../../core/src/messages.js';

export type Moment = 'escribir' | 'decidir';

export const MOMENT_KEY = 'oficina.momento';
/** Cards shown before «y N más». */
export const HAND_SHOWN = 3;
/** The team's activity: this many buckets of this long, oldest first. */
export const ACTIVITY_BUCKETS = 6;
const BUCKET_MS = 5 * 60_000;

/** The moment remembered, or «Decidir» (where what waits on you is in sight). */
export function readMoment(raw: string | null): Moment {
  return raw === 'escribir' ? 'escribir' : 'decidir';
}

/**
 * How busy an agent was in the last half hour, from the day's log: one count
 * per five minutes, oldest first (a little bar chart beside its name).
 */
export function activityOf(entries: readonly DayLogEntry[], agent: string, now: number): number[] {
  const buckets = new Array<number>(ACTIVITY_BUCKETS).fill(0);
  const since = now - ACTIVITY_BUCKETS * BUCKET_MS;
  for (const e of entries) {
    if (e.agent !== agent || e.at <= since || e.at > now) continue;
    const i = Math.min(ACTIVITY_BUCKETS - 1, Math.floor((e.at - since) / BUCKET_MS));
    buckets[i] += 1;
  }
  return buckets;
}

/** The cards in sight and how many wait behind them. */
export function handOf<T>(waiting: readonly T[], all: boolean): { shown: T[]; more: number } {
  const shown = all ? [...waiting] : waiting.slice(0, HAND_SHOWN);
  return { shown, more: waiting.length - shown.length };
}

/** «Decidir · 3» in the moment bar; «Escribir» with how many wait, said once. */
export function momentLabel(moment: Moment, waiting: number): string {
  if (moment === 'decidir') return waiting > 0 ? `Decidir · ${waiting}` : 'Decidir';
  return 'Escribir';
}
