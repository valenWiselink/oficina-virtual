import type { AgentKind, AgentView } from '../views/agentViews.js';

/**
 * "Cuando nadie esté trabajando": the update installs itself once no agent is
 * busy. Busy is everything the board puts under "Trabajando", plus an agent
 * stopped on a permission or a question (installing restarts the office, and
 * the wait would be cut).
 */
const BUSY_KINDS: ReadonlySet<AgentKind> = new Set<AgentKind>([
  'meet',
  'research',
  'work',
  'think',
]);

/** How long the office must stay quiet before installing: the gap between
 *  two tools of the same turn is not "nobody working". */
export const QUIET_BEFORE_INSTALL_MS = 30_000;

export function isBusy(view: AgentView): boolean {
  return BUSY_KINDS.has(view.kind) || (view.kind === 'needs' && view.blocking === true);
}

/** Agents in the middle of something, counting a held permission whose
 *  agent is not on the board (its session never showed up) as one more. */
export function busyCount(views: AgentView[], permissions: ReadonlyArray<{ id?: number }>): number {
  const onBoard = new Set(views.map((v) => v.id));
  const loose = permissions.filter((p) => p.id === undefined || !onBoard.has(p.id)).length;
  return views.filter(isBusy).length + loose;
}

/** The "quiet since" mark: kept while nobody works, gone on any work. */
export function nextQuietSince(prev: number | null, busy: boolean, now: number): number | null {
  if (busy) return null;
  return prev ?? now;
}

export function quietLongEnough(
  since: number | null,
  now: number,
  quietMs = QUIET_BEFORE_INSTALL_MS,
): boolean {
  return since !== null && now - since >= quietMs;
}
