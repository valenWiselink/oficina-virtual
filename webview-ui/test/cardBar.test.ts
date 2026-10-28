import { describe, expect, it } from 'vitest';

import {
  cardVariant,
  drawerPull,
  mergeOrder,
  NO_INSETS,
  officeRoom,
  reorderByPointer,
  stripOverlap,
} from '../src/components/cardBar.js';

describe('cardVariant', () => {
  it('the showing pane wins over the selected character', () => {
    expect(cardVariant(1, { activeId: 1, focusedId: 1 })).toBe('active');
    expect(cardVariant(2, { activeId: 1, focusedId: 2 })).toBe('focused');
    expect(cardVariant(3, { activeId: 1, focusedId: 2 })).toBe('default');
  });
});

describe('mergeOrder', () => {
  it('keeps the saved order, drops closed agents, appends new ones in creation order', () => {
    expect(mergeOrder([3, 1, 9], [1, 2, 3, 4])).toEqual([3, 1, 2, 4]);
  });

  it('is the live order when nothing was saved', () => {
    expect(mergeOrder([], [5, 6])).toEqual([5, 6]);
  });
});

describe('reorderByPointer', () => {
  // Cards 1..4 laid out 100px apart: midpoints 50, 150, 250, 350.
  const mid = (id: number) => (id - 1) * 100 + 50;

  it('inserts before the first other card whose midpoint is right of the finger', () => {
    expect(reorderByPointer([1, 2, 3, 4], 4, mid, 120)).toEqual([1, 4, 2, 3]);
  });

  it('moves the card last when the finger is past every midpoint', () => {
    expect(reorderByPointer([1, 2, 3, 4], 1, mid, 900)).toEqual([2, 3, 4, 1]);
  });

  it('moves the card first when the finger is left of every midpoint', () => {
    expect(reorderByPointer([1, 2, 3, 4], 3, mid, 0)).toEqual([3, 1, 2, 4]);
  });

  it('skips cards that are not laid out', () => {
    const partial = (id: number) => (id === 2 ? null : mid(id));
    expect(reorderByPointer([1, 2, 3], 1, partial, 200)).toEqual([2, 1, 3]);
  });
});

describe('stripOverlap (the strip of tabs over the office)', () => {
  it('lies over the side it docks to; at the bottom, or hidden, not at all', () => {
    expect(stripOverlap('right', true)).toEqual({ ...NO_INSETS, right: 72 });
    expect(stripOverlap('left', true)).toEqual({ ...NO_INSETS, left: 72 });
    expect(stripOverlap('top', true)).toEqual({ ...NO_INSETS, top: 64 });
    expect(stripOverlap('bottom', true)).toEqual(NO_INSETS);
    expect(stripOverlap('right', false)).toEqual(NO_INSETS);
  });

  it('the office makes room inside and the drawer comes over it', () => {
    const o = stripOverlap('right', true);
    expect(officeRoom(o)).toMatchObject({ paddingRight: 72, paddingLeft: 0 });
    expect(drawerPull(o)).toMatchObject({ marginLeft: -72, marginRight: -0 });
    expect(drawerPull(stripOverlap('top', true))).toMatchObject({ marginBottom: -64 });
  });
});
