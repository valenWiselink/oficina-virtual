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
