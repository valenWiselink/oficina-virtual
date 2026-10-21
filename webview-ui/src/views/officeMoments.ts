import type { AgentView } from './agentViews.js';

const BUSY: ReadonlySet<AgentView['kind']> = new Set(['work', 'meet', 'research', 'think']);

/** Working in some way (typing, in a meeting, researching, thinking). */
export const isBusy = (v: AgentView): boolean => BUSY.has(v.kind);

/**
 * "Terminaron todos": someone was working a moment ago, and now nobody is
 * and nobody waits on you (a wait is not a moment to stretch your legs).
 */
export function allFinished(wasBusy: boolean, views: readonly AgentView[]): boolean {
  if (!wasBusy || views.length === 0) return false;
  return views.every((v) => !isBusy(v) && v.kind !== 'needs');
}

/** "Terminaron todos" moments of the last hours, shown or not (calm, focus,
 *  or nobody looking): «Volviste» tells the ones that happened while you
 *  were away. In memory: a reload starts without them. */
const KEEP_MOMENTS_MS = 12 * 60 * 60_000;
let allDoneAt: number[] = [];

export function noteAllDone(at: number): void {
  allDoneAt = [...allDoneAt.filter((t) => at - t < KEEP_MOMENTS_MS), at];
}

export function allDoneBetween(from: number, to: number): boolean {
  return allDoneAt.some((t) => t >= from && t <= to);
}
