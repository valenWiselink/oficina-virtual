import { describe, expect, it } from 'vitest';

import { addMotions, MOTION_MS, pruneMotions } from '../src/views/cardMotion.js';
import { MAX_MOVES, type Placed, planTravel } from '../src/views/cardTravel.js';

/** Cards as columns of ids, top to bottom, 260 px apart and 100 px tall. */
function board(columns: Record<string, number[]>): Map<number, Placed> {
  const placed = new Map<number, Placed>();
  Object.entries(columns).forEach(([column, ids], c) => {
    ids.forEach((id, row) => placed.set(id, { column, x: c * 260, y: row * 100 }));
  });
  return placed;
}

describe('which cards travel', () => {
  it('nothing on the first look', () => {
    expect(planTravel(new Map(), board({ needs: [1], work: [2] }))).toEqual([]);
  });

  it('a card that changes column slides from where it was, and rides on top', () => {
    const before = board({ needs: [], work: [1, 2], done: [] });
    const after = board({ needs: [], work: [2], done: [1] });
    expect(planTravel(before, after)).toEqual([
      // 2 rises one place to close the gap.
      { id: 2, dx: 0, dy: 100, crossing: false },
      // 1 comes from the work column (260 px to the left of done).
      { id: 1, dx: -260, dy: 0, crossing: true },
    ]);
  });

  it('the ones below make room when a card arrives above them', () => {
    const before = board({ needs: [3], work: [1] });
    const after = board({ needs: [1, 3], work: [] });
    const travels = planTravel(before, after);
    expect(travels).toContainEqual({ id: 1, dx: 260, dy: 0, crossing: true });
    expect(travels).toContainEqual({ id: 3, dx: 0, dy: -100, crossing: false });
  });

  it('cards that stay put do not move', () => {
    const before = board({ needs: [], work: [1, 2], done: [3] });
    const after = board({ needs: [], work: [1], done: [3], idle: [] });
    expect(planTravel(before, after)).toEqual([]);
  });

  it('a reorder inside a column slides too', () => {
    const before = board({ done: [1, 2] });
    const after = board({ done: [2, 1] });
    expect(planTravel(before, after)).toEqual([
      { id: 2, dx: 0, dy: 100, crossing: false },
      { id: 1, dx: 0, dy: -100, crossing: false },
    ]);
  });

  it(`more than ${MAX_MOVES} changes at once (a reconnect) just appear in place`, () => {
    const before = board({ work: [1, 2, 3, 4, 5], done: [] });
    const after = board({ work: [], done: [1, 2, 3, 4, 5] });
    expect(planTravel(before, after)).toEqual([]);
  });

  it(`up to ${MAX_MOVES} travel`, () => {
    const before = board({ work: [1, 2, 3, 4, 5], done: [] });
    const after = board({ work: [5], done: [1, 2, 3, 4] });
    expect(planTravel(before, after).filter((t) => t.crossing)).toHaveLength(4);
  });

  it('cards that arrive or leave count as changes', () => {
    const before = board({ work: [1, 2, 3] });
    const after = board({ work: [3, 6, 7, 8], idle: [] });
    // 1 and 2 left, 6, 7 and 8 arrived: five changes.
    expect(planTravel(before, after)).toEqual([]);
  });

  it('sub-pixel differences are not a move', () => {
    const before = new Map<number, Placed>([[1, { column: 'work', x: 0, y: 100 }]]);
    const after = new Map<number, Placed>([[1, { column: 'work', x: 0.4, y: 100.6 }]]);
    expect(planTravel(before, after)).toEqual([]);
  });
});

describe('how long a card hops or pops', () => {
  const live = (m: ReturnType<typeof pruneMotions>) => [...m].map(([id, t]) => `${id}:${t.motion}`);

  it('a later change on the board neither cuts a hop short nor keeps it', () => {
    let motions = addMotions(new Map(), new Map([[1, 'hop' as const]]), 0);
    // Another agent pops in 100 ms later.
    motions = addMotions(motions, new Map([[2, 'pop' as const]]), 100);
    expect(live(pruneMotions(motions, 500))).toEqual(['1:hop', '2:pop']);
    expect(live(pruneMotions(motions, MOTION_MS))).toEqual(['2:pop']);
    // Gone for good: it will not replay when the card changes column later.
    expect(live(pruneMotions(motions, MOTION_MS + 200))).toEqual([]);
  });

  it('a card that hops again starts its time over', () => {
    let motions = addMotions(new Map(), new Map([[1, 'hop' as const]]), 0);
    motions = addMotions(motions, new Map([[1, 'hop' as const]]), 600);
    expect(live(pruneMotions(motions, MOTION_MS))).toEqual(['1:hop']);
  });
});
