import type { AgentKind, AgentView } from './agentViews.js';

/**
 * The graph's filter by state: it fades everyone else, it never hides
 * anybody (the graph keeps its shape). Pure.
 */

export type GraphFilter = 'all' | 'needs' | 'work' | 'idle';

/** How visible the others stay under a filter or a focused meeting (a
 *  little less than while hovering: these last). */
export const QUIET_ALPHA = 0.3;

export const GRAPH_FILTERS: ReadonlyArray<{ id: GraphFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'needs', label: 'Te necesitan' },
  { id: 'work', label: 'Trabajando' },
  { id: 'idle', label: 'Sin tarea' },
];

const KINDS: Record<Exclude<GraphFilter, 'all'>, readonly AgentKind[]> = {
  needs: ['needs'],
  work: ['work', 'meet', 'research', 'think'],
  idle: ['idle'],
};

export function matchesFilter(v: AgentView, filter: GraphFilter): boolean {
  return filter === 'all' || KINDS[filter].includes(v.kind);
}

/** How many agents each option would leave crisp. */
export function filterCounts(views: readonly AgentView[]): Record<GraphFilter, number> {
  const count = (f: GraphFilter) => views.filter((v) => matchesFilter(v, f)).length;
  return { all: views.length, needs: count('needs'), work: count('work'), idle: count('idle') };
}

/** What stays crisp under a filter (node keys as the scene names them);
 *  null: everything. */
export function filterFocus(
  views: readonly AgentView[],
  filter: GraphFilter,
): ReadonlySet<string> | null {
  if (filter === 'all') return null;
  const keys = new Set<string>();
  for (const v of views) {
    if (!matchesFilter(v, filter)) continue;
    keys.add(`a${v.id}`);
    for (const s of v.subagents) keys.add(`s${s.id}`);
    if (v.kind === 'needs') keys.add('vos');
    if (v.kind === 'research' || v.subagents.some((s) => s.kind === 'research'))
      keys.add('library');
  }
  return keys;
}
