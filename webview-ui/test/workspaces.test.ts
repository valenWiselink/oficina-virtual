import { describe, expect, it } from 'vitest';

import {
  ALL,
  changedKeys,
  followKeys,
  inWorkspace,
  needsByWorkspace,
  newcomersToAssign,
  withoutWorkspace,
  workspaceOf,
  type WorkspaceState,
  workspaceToShow,
} from '../src/workspaces/workspaceRules.js';

const state = (over: Partial<WorkspaceState> = {}): WorkspaceState => ({
  workspaces: [
    { id: 'wl', name: 'Wiselink', folders: ['development', 'webapp'] },
    { id: 'per', name: 'Personal', folders: ['oficina-virtual'] },
  ],
  assignments: {},
  current: ALL,
  ...over,
});

const agent = (id: number, key: string, dir?: string, kind = 'idle') => ({ id, key, dir, kind });

describe('workspaceOf', () => {
  it('uses the manual assignment first, then the folder, else none', () => {
    const s = state({ assignments: { k1: 'per' } });
    expect(workspaceOf(agent(1, 'k1', 'webapp'), s)).toBe('per');
    expect(workspaceOf(agent(2, 'k2', 'WebApp'), s)).toBe('wl');
    expect(workspaceOf(agent(3, 'k3', 'otra'), s)).toBeNull();
    expect(workspaceOf(agent(4, 'k4'), s)).toBeNull();
  });

  it('ignores an assignment to a workspace that no longer exists', () => {
    expect(workspaceOf(agent(1, 'k1', 'webapp'), state({ assignments: { k1: 'borrado' } }))).toBe(
      'wl',
    );
  });
});

describe('inWorkspace and needsByWorkspace', () => {
  const agents = [
    agent(1, 'a', 'webapp', 'needs'),
    agent(2, 'b', 'oficina-virtual'),
    agent(3, 'c', 'otra', 'needs'),
  ];

  it('shows everyone in ALL and only its own in a workspace', () => {
    expect(inWorkspace(agents, state(), ALL)).toHaveLength(3);
    expect(inWorkspace(agents, state(), 'per').map((a) => a.id)).toEqual([2]);
  });

  it('counts who needs you per workspace, ALL counting everyone', () => {
    expect(needsByWorkspace(agents, state())).toEqual({ [ALL]: 2, wl: 1 });
  });
});

describe('workspaceToShow', () => {
  it('stays where the agent shows, else jumps to its workspace or to ALL', () => {
    expect(workspaceToShow(agent(1, 'a', 'webapp'), state({ current: 'wl' }))).toBe('wl');
    expect(workspaceToShow(agent(1, 'a', 'webapp'), state({ current: 'per' }))).toBe('wl');
    expect(workspaceToShow(agent(1, 'a', 'otra'), state({ current: 'per' }))).toBe(ALL);
    expect(workspaceToShow(agent(1, 'a', 'webapp'), state())).toBe(ALL);
  });
});

describe('bookkeeping', () => {
  it('deleting a workspace drops its assignments and leaves it if on screen', () => {
    const s = withoutWorkspace(
      state({ assignments: { a: 'per', b: 'wl' }, current: 'per' }),
      'per',
    );
    expect(s.workspaces.map((w) => w.id)).toEqual(['wl']);
    expect(s.assignments).toEqual({ b: 'wl' });
    expect(s.current).toBe(ALL);
  });

  it('a manual assignment follows an agent whose key changed', () => {
    const moved = changedKeys(new Map([[1, 'nombre']]), [{ id: 1, key: 'sesion-uuid' }]);
    expect(moved).toEqual([{ from: 'nombre', to: 'sesion-uuid' }]);
    expect(followKeys({ nombre: 'per' }, moved)).toEqual({ 'sesion-uuid': 'per' });
  });

  it('an agent launched while a workspace is on screen joins it', () => {
    const s = state({ current: 'per' });
    const agents = [agent(1, 'viejo', 'webapp'), agent(2, 'nuevo', 'webapp')];
    expect(newcomersToAssign(new Set([1]), agents, s)).toEqual([
      { key: 'nuevo', workspaceId: 'per' },
    ]);
    expect(newcomersToAssign(null, agents, s)).toEqual([]);
    expect(newcomersToAssign(new Set([1]), agents, state())).toEqual([]);
  });
});
