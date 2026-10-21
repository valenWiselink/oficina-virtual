import { describe, expect, it } from 'vitest';

import type { AgentKind, AgentView } from '../src/views/agentViews.js';
import {
  keepsMeetingEdge,
  libraryCenter,
  libraryOpen,
  libraryRadius,
  librarySeat,
  librarySpot,
  libraryVisitors,
} from '../src/views/graphLibrary.js';

/** The graph world's height (graphScene's WORLD, which needs a browser). */
const WORLD = { h: 880 };
const sub = (id: number, kind: AgentKind) => ({ id, label: `sub-${id}`, kind, statusText: '' });
const view = (over: Partial<AgentView>): AgentView =>
  ({
    id: 1,
    key: 'k1',
    name: 'A',
    kind: 'meet',
    statusText: '',
    supervisedBy: [],
    subagents: [],
    ...over,
  }) as AgentView;

describe('the library', () => {
  it('takes in the researching subagents and members, in order', () => {
    const list = [
      view({ id: 1, subagents: [sub(-1, 'work'), sub(-2, 'research')] }),
      view({ id: 2, kind: 'work', subagents: [sub(-3, 'research')] }),
    ];
    expect(libraryVisitors(list)).toEqual([
      { leadId: 1, subId: -2 },
      { leadId: 2, subId: -3 },
    ]);
    expect(libraryOpen(list)).toBe(true);
  });

  it('opens for a researching agent too, and stays shut otherwise', () => {
    expect(libraryOpen([view({ kind: 'research' })])).toBe(true);
    expect(libraryOpen([view({ subagents: [sub(-1, 'work')] })])).toBe(false);
  });

  it('seats everyone apart and inside, growing with them', () => {
    for (let n = 1; n <= 8; n++) {
      const seats = Array.from({ length: n }, (_, i) => librarySeat(i, n));
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(seats[i].dx - seats[j].dx, seats[i].dy - seats[j].dy);
          expect(d).toBeGreaterThanOrEqual(78);
        }
      for (const s of seats) expect(Math.hypot(s.dx, s.dy) + 22).toBeLessThan(libraryRadius(n));
    }
    expect(libraryRadius(0)).toBe(52);
    expect(libraryRadius(6)).toBeGreaterThan(libraryRadius(2));
  });

  it('moves in from its corner as it grows, never leaving the world', () => {
    expect(libraryCenter(0, WORLD.h)).toEqual({ x: 110, y: WORLD.h - 110 });
    const big = libraryCenter(8, WORLD.h);
    expect(big.x - libraryRadius(8)).toBeGreaterThan(0);
    expect(big.y + libraryRadius(8)).toBeLessThan(WORLD.h);
  });
});

describe('the graph sends researchers to the library', () => {
  it('a researching member gets its library seat and is let go by its lead', () => {
    const list = [view({ subagents: [sub(-1, 'work'), sub(-2, 'research'), sub(-3, 'work')] })];
    const visitors = libraryVisitors(list);
    expect(librarySpot(visitors, 1, -2, WORLD.h)).toEqual(libraryCenter(1, WORLD.h));
    expect(librarySpot(visitors, 1, -1, WORLD.h)).toBeNull();
    expect(list[0].subagents.filter((s) => keepsMeetingEdge(s.kind)).map((s) => s.id)).toEqual([
      -1, -3,
    ]);
  });

  it('two from different meetings sit apart', () => {
    const list = [
      view({ id: 1, subagents: [sub(-1, 'research')] }),
      view({ id: 2, subagents: [sub(-5, 'research')] }),
    ];
    const visitors = libraryVisitors(list);
    const a = librarySpot(visitors, 1, -1, WORLD.h)!;
    const b = librarySpot(visitors, 2, -5, WORLD.h)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(78);
  });
});
