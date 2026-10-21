import { riskyReason } from '../permissions/riskyCommand.js';
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

/** Whether an agent's pill has something to act on. */
export function pillActs(view: AgentView | undefined): view is AgentView {
  return !!view && view.kind === 'needs' && (!!view.permission || !!view.yourTurnId);
}

/** What opening an agent selects on the graph: the agent itself, or, for a
 *  meeting member (a teammate with a tab of its own), its lead with the
 *  member marked. */
export function selectionOf(
  views: readonly AgentView[],
  agentId: number,
): { id: number; member?: number } {
  if (views.some((v) => v.id === agentId)) return { id: agentId };
  const lead = views.find((v) => v.subagents.some((s) => s.id === agentId));
  return lead ? { id: lead.id, member: agentId } : { id: agentId };
}

/** The pick after a Ctrl+click (`toggle`) or a box (`add`). The first
 *  Ctrl+click also takes the agent already selected, as in any list. */
export function pickNext(
  prev: readonly number[],
  ids: readonly number[],
  how: 'toggle' | 'add',
  selected: number | null,
): number[] {
  const start = prev.length === 0 && selected !== null ? [selected] : [...prev];
  if (how === 'add') return [...new Set([...start, ...ids])];
  const next = new Set(start);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

/** The permissions among them that are safe to approve all at once. */
export function simplePermissions(views: readonly AgentView[]) {
  return views.flatMap((v) => {
    const p = v.permission;
    if (!p) return [];
    return riskyReason(p.toolName, p.toolInput as Record<string, unknown>) ? [] : [p];
  });
}
