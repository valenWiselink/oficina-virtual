import { describe, expect, it } from 'vitest';

import type { AgentView } from '../src/views/agentViews.js';
import { filterCounts, filterFocus, matchesFilter } from '../src/views/graphFilter.js';

const view = (id: number, over: Partial<AgentView> = {}): AgentView => ({
  id,
  canSetRun: false,
  supervisorNames: [],
  teamSize: 0,
  supervisedBy: [],
  name: `A${id}`,
  key: `k${id}`,
  palette: 0,
  hueShift: 0,
  kind: 'idle',
  statusText: '',
  subagents: [],
  tasks: [],
  hasTerminal: true,
  ...over,
});
const office = [
  view(1, { kind: 'needs' }),
  view(2, {
    kind: 'meet',
    subagents: [{ id: -1, label: 'S', kind: 'research', statusText: '' }],
  }),
  view(3, { kind: 'think' }),
  view(4),
  view(5, { kind: 'done' }),
];

describe('graph filter by state', () => {
  it('busy is every kind of busy; "Sin tarea" is only idle', () => {
    expect(office.filter((v) => matchesFilter(v, 'work')).map((v) => v.id)).toEqual([2, 3]);
    expect(office.filter((v) => matchesFilter(v, 'idle')).map((v) => v.id)).toEqual([4]);
    expect(office.every((v) => matchesFilter(v, 'all'))).toBe(true);
  });

  it('counts each option', () => {
    expect(filterCounts(office)).toEqual({ all: 5, needs: 1, work: 2, idle: 1 });
  });

  it('keeps crisp who matches, their meeting, and "Vos" or the library they use', () => {
    expect(filterFocus(office, 'all')).toBeNull();
    expect([...filterFocus(office, 'needs')!].sort()).toEqual(['a1', 'vos']);
    expect([...filterFocus(office, 'work')!].sort()).toEqual(['a2', 'a3', 'library', 's-1']);
  });
});
