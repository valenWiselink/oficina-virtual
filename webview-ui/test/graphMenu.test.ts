import { describe, expect, it } from 'vitest';

import type { AgentView } from '../src/views/agentViews.js';
import { type MenuAbilities, menuItems, menuSubject } from '../src/views/graphMenu.js';

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
const all: MenuAbilities = {
  answer: true,
  markDone: true,
  handOff: true,
  adopt: true,
  edit: true,
  close: true,
  workspaces: true,
};
const ctx = { following: null, hasPins: false };
const ids = (items: { id: string }[]) => items.map((i) => i.id);
const permission = (command: string) => ({
  type: 'permissionPending' as const,
  requestId: 'r1',
  toolName: 'Bash',
  toolInput: { command },
  createdAt: 0,
});

describe('menuSubject', () => {
  it('an agent, its pill or its border arrow are the agent; a member is a member', () => {
    expect(menuSubject({ type: 'agent', id: 3 })).toEqual({ kind: 'agent', id: 3 });
    expect(menuSubject({ type: 'pill', id: 3 })).toEqual({ kind: 'agent', id: 3 });
    expect(menuSubject({ type: 'arrow', id: 3 })).toEqual({ kind: 'agent', id: 3 });
    expect(menuSubject({ type: 'agent', id: 3, member: -1 })).toEqual({
      kind: 'member',
      id: 3,
      member: -1,
    });
    expect(menuSubject({ type: 'vos' })).toEqual({ kind: 'vos' });
    expect(menuSubject({ type: 'passive' })).toEqual({ kind: 'background' });
    expect(menuSubject(null)).toEqual({ kind: 'background' });
  });
});

describe('menuItems', () => {
  it('an agent with its terminal: everything, closing last and apart', () => {
    const items = menuItems({ kind: 'agent', id: 1 }, [view(1)], all, ctx);
    expect(ids(items)).toEqual([
      'terminal',
      'chat',
      'handoff',
      'follow',
      'note',
      'move',
      'edit',
      'close',
    ]);
    expect(items.at(-1)).toMatchObject({ danger: true });
    expect(items.at(-1)!.group).not.toBe(items.at(-2)!.group);
  });

  it('what it asks comes right after: approve and deny, or done and its PR', () => {
    const asks = menuItems(
      { kind: 'agent', id: 1 },
      [view(1, { kind: 'needs', permission: permission('npm test') })],
      all,
      ctx,
    );
    expect(ids(asks).slice(2, 4)).toEqual(['approve', 'deny']);
    expect(asks[2].confirm).toBeUndefined();
    const turn = menuItems(
      { kind: 'agent', id: 1 },
      [view(1, { kind: 'needs', yourTurnId: 't', prUrl: 'https://x/pull/1' })],
      all,
      ctx,
    );
    expect(ids(turn).slice(2, 4)).toEqual(['done', 'pr']);
  });

  it('a risky permission asks to confirm', () => {
    const items = menuItems(
      { kind: 'agent', id: 1 },
      [view(1, { kind: 'needs', permission: permission('git push origin main') })],
      all,
      ctx,
    );
    expect(items.find((i) => i.id === 'approve')?.confirm).toMatch(/Riesgoso/);
  });

  it('an outside agent offers to bring it in; a viewer gets no actions', () => {
    const outside = [view(1, { hasTerminal: false })];
    expect(ids(menuItems({ kind: 'agent', id: 1 }, outside, all, ctx))[0]).toBe('adopt');
    const none: MenuAbilities = {
      answer: false,
      markDone: false,
      handOff: false,
      adopt: false,
      edit: false,
      close: false,
      workspaces: false,
    };
    expect(ids(menuItems({ kind: 'agent', id: 1 }, outside, none, ctx))).toEqual([
      'follow',
      'note',
    ]);
  });

  it('following it says so', () => {
    const items = menuItems({ kind: 'agent', id: 1 }, [view(1)], all, {
      following: 1,
      hasPins: false,
    });
    expect(items.find((i) => i.id === 'follow')?.label).toBe('Dejar de seguir');
  });

  it('background, "Vos" and a member', () => {
    expect(ids(menuItems({ kind: 'background' }, [], all, ctx))).toEqual(['fit']);
    expect(
      ids(menuItems({ kind: 'background' }, [], all, { following: null, hasPins: true })),
    ).toEqual(['fit', 'unpin']);
    expect(ids(menuItems({ kind: 'vos' }, [view(1)], all, ctx))).toEqual([]);
    expect(ids(menuItems({ kind: 'vos' }, [view(1, { kind: 'needs' })], all, ctx))).toEqual([
      'urgent',
    ]);
    expect(ids(menuItems({ kind: 'member', id: 1, member: -2 }, [view(1)], all, ctx))).toEqual([
      'member',
      'lead',
    ]);
  });
});
