import { type AgentView, byUrgency } from './agentViews.js';

/**
 * Which agent a gesture or a key of the graph picks. Pure.
 */

/** Who a click on "Vos" opens: the most urgent wait, by the same order as
 *  Alt+N ("Te necesita": what blocks first, then the longest wait); null
 *  when nobody waits (the click then does nothing). */
export function mostUrgent(views: readonly AgentView[]): number | null {
  return views.filter((v) => v.kind === 'needs').sort(byUrgency)[0]?.id ?? null;
}

/** Tab's order on the graph: whoever waits on you first (most urgent first),
 *  then everyone else in board order (by id, as Alt+1…9). */
export function tabOrder(views: readonly AgentView[]): number[] {
  const waiting = views.filter((v) => v.kind === 'needs').sort(byUrgency);
  const rest = views.filter((v) => v.kind !== 'needs').sort((a, b) => a.id - b.id);
  return [...waiting, ...rest].map((v) => v.id);
}

/** The next (dir 1) or previous (-1) agent after `current`; null past either
 *  end, so Tab can leave the graph (never a keyboard trap). With nothing
 *  picked it starts at the first (or, backwards, the last). */
export function stepIn(
  order: readonly number[],
  current: number | null,
  dir: 1 | -1,
): number | null {
  const at = current === null ? -1 : order.indexOf(current);
  if (at === -1) return (dir === 1 ? order[0] : order[order.length - 1]) ?? null;
  return order[at + dir] ?? null;
}
