import { describe, expect, it } from 'vitest';

import { type GazeContext, gazeTarget, lookToward } from '../src/views/clawdGaze.js';

const ctx = (over: Partial<GazeContext> = {}): GazeContext => ({
  pointer: null,
  near: 200,
  celebrant: null,
  vos: { x: 0, y: 0 },
  ...over,
});
const me = { id: 1, at: { x: 500, y: 500 }, waits: false };

describe('lookToward', () => {
  it('one pixel per axis, toward the point', () => {
    expect(lookToward({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ dx: 1, dy: 0 });
    expect(lookToward({ x: 0, y: 0 }, { x: -100, y: -100 })).toEqual({ dx: -1, dy: -1 });
    expect(lookToward({ x: 0, y: 0 }, { x: 10, y: 100 })).toEqual({ dx: 0, dy: 1 });
    expect(lookToward({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe('gazeTarget', () => {
  it('nothing to look at: its own business', () => {
    expect(gazeTarget(ctx(), me)).toBeNull();
  });

  it('the pointer, only when it comes near', () => {
    expect(gazeTarget(ctx({ pointer: { x: 600, y: 520 } }), me)).toEqual({ x: 600, y: 520 });
    expect(gazeTarget(ctx({ pointer: { x: 900, y: 500 } }), me)).toBeNull();
  });

  it('one that waits on you looks at "Vos" when the pointer is away', () => {
    expect(gazeTarget(ctx(), { ...me, waits: true })).toEqual({ x: 0, y: 0 });
    expect(gazeTarget(ctx({ pointer: { x: 550, y: 500 } }), { ...me, waits: true })).toEqual({
      x: 550,
      y: 500,
    });
  });

  it('everyone else turns to whoever celebrates; the celebrant does not', () => {
    const party = ctx({
      celebrant: { id: 2, at: { x: 100, y: 100 } },
      pointer: { x: 510, y: 500 },
    });
    expect(gazeTarget(party, me)).toEqual({ x: 100, y: 100 });
    expect(gazeTarget(party, { ...me, id: 2 })).toEqual({ x: 510, y: 500 });
  });
});
