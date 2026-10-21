import { describe, expect, it } from 'vitest';

import type { AgentView } from '../src/views/agentViews.js';
import { ClawdLife } from '../src/views/clawdLife.js';
import { TRICK_CLICKS } from '../src/views/clawdTricks.js';
import { poseFor } from '../src/views/graphDraw.js';
import { mostUrgent, pillActs, stepIn, tabOrder } from '../src/views/graphPick.js';

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

describe('mostUrgent ("Vos")', () => {
  it('opens the most urgent wait, as Alt+N does, not the first in the list', () => {
    const views = [
      view(1, { kind: 'needs', waitingSince: 5_000 }),
      view(2, { kind: 'needs', waitingSince: 1_000 }),
      view(3, { kind: 'needs', waitingSince: 9_000, blocking: true }),
      view(4, { kind: 'work' }),
    ];
    expect(mostUrgent(views)).toBe(3);
    expect(mostUrgent(views.filter((v) => v.id !== 3))).toBe(2);
  });

  it('nobody waiting: nothing (the click must not close the panel)', () => {
    expect(mostUrgent([view(1, { kind: 'work' }), view(2)])).toBeNull();
  });
});

describe('tabOrder / stepIn', () => {
  it('whoever waits on you first, then the rest in board order', () => {
    const views = [
      view(5),
      view(2, { kind: 'work' }),
      view(9, { kind: 'needs', waitingSince: 300 }),
      view(7, { kind: 'needs', waitingSince: 100 }),
    ];
    expect(tabOrder(views)).toEqual([7, 9, 2, 5]);
  });

  it('steps both ways and lets Tab leave past either end', () => {
    const order = [7, 9, 2];
    expect(stepIn(order, null, 1)).toBe(7);
    expect(stepIn(order, null, -1)).toBe(2);
    expect(stepIn(order, 7, 1)).toBe(9);
    expect(stepIn(order, 9, -1)).toBe(7);
    expect(stepIn(order, 2, 1)).toBeNull();
    expect(stepIn(order, 7, -1)).toBeNull();
    expect(stepIn(order, 42, 1)).toBe(7);
    expect(stepIn([], null, 1)).toBeNull();
  });
});

describe('the second click of a double click', () => {
  it('does not hop again but still counts toward the trick', () => {
    const life = new ClawdLife();
    life.greet(1, 0);
    expect(life.hop(1, 100)).toBeGreaterThan(0);
    const other = new ClawdLife();
    other.greet(1, 0, false);
    expect(other.hop(1, 100)).toBe(0);
    for (let i = 0; i < TRICK_CLICKS; i++) other.greet(1, i * 150, i === 0);
    expect(other.trick(1, TRICK_CLICKS * 150)).not.toBeNull();
  });
});

describe('calm mode poses', () => {
  it('stand still: the same pose whatever the time, never blinking', () => {
    for (const kind of ['work', 'think', 'needs', 'research', 'idle'] as const) {
      const a = poseFor(kind, 3, 0.4, true);
      const b = poseFor(kind, 3, 17.9, true);
      expect(a).toEqual(b);
      expect(a.blink).toBeFalsy();
    }
    expect(poseFor('work', 3, 0.1).type).not.toBe(poseFor('work', 3, 0.3).type);
  });
});

describe('pillActs', () => {
  it('a pill grows only while it asks something you can answer here', () => {
    const permission = {
      type: 'permissionPending' as const,
      requestId: 'r',
      toolName: 'Bash',
      toolInput: {},
      createdAt: 0,
    };
    expect(pillActs(view(1, { kind: 'needs', permission }))).toBe(true);
    expect(pillActs(view(1, { kind: 'needs', yourTurnId: 't' }))).toBe(true);
    expect(pillActs(view(1, { kind: 'needs', asksInTerminal: true }))).toBe(false);
    expect(pillActs(view(1, { kind: 'work', permission }))).toBe(false);
    expect(pillActs(undefined)).toBe(false);
  });
});
