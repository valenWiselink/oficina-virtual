import { describe, expect, it } from 'vitest';

import {
  isSupervisor,
  sameTeam,
  teamCandidates,
  workspaceTeam,
} from '../src/agents/supervisionRules.js';
import type { WorkspaceState } from '../src/workspaces/workspaceRules.js';

const sid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const agents = [
  { id: 1, key: sid(1), dir: 'development', supervision: { kind: 'workspace' } },
  { id: 2, key: sid(2), dir: 'development' },
  { id: 3, key: sid(3), dir: 'webapp' },
  { id: 4, key: sid(4), dir: 'personal' },
  { id: 5, key: 'sin-sesion', dir: 'development' },
  { id: 6, key: sid(6), dir: 'development', supervision: { kind: 'all' } },
];
const state: WorkspaceState = {
  workspaces: [
    { id: 'wl', name: 'Wiselink', folders: ['development', 'webapp'] },
    { id: 'per', name: 'Personal', folders: ['personal'] },
  ],
  assignments: {},
  current: 'todos',
};

describe('supervision teams', () => {
  it('takes the workspace agents, never itself, other supervisors or agents without a session', () => {
    expect(workspaceTeam(agents, 1, state, 'wl')).toEqual([sid(2), sid(3)]);
    expect(workspaceTeam(agents, 1, state, 'per')).toEqual([sid(4)]);
  });

  it('offers the same people to pick by hand', () => {
    expect(teamCandidates(agents, 1).map((a) => a.id)).toEqual([2, 3, 4]);
  });

  it('tells a supervisor and compares teams in any order', () => {
    expect(isSupervisor(agents[0])).toBe(true);
    expect(isSupervisor({ supervision: { kind: 'none' } })).toBe(false);
    expect(sameTeam([sid(2), sid(3)], [sid(3), sid(2)])).toBe(true);
    expect(sameTeam([sid(2)], [sid(2), sid(3)])).toBe(false);
  });
});
