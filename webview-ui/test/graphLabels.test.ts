import { describe, expect, it } from 'vitest';

import { placeLabel, type Side } from '../src/views/graphLabels.js';

const node = { x: 100, y: 100, r: 20 };
const size = { w: 60, h: 20 };
const prefer: Side[] = ['below', 'left', 'right', 'above'];

describe('placeLabel', () => {
  it('goes below when free', () => {
    const r = placeLabel('a', node, size, prefer, [], new Map());
    expect(r).toEqual({ x: 70, y: 128, w: 60, h: 20 });
  });

  it('moves beside when below is taken, and sticks there', () => {
    const memory = new Map<string, Side>();
    const blocker = { x: 60, y: 125, w: 80, h: 30 };
    const r = placeLabel('a', node, size, prefer, [blocker], memory);
    expect(r.x + r.w).toBeLessThanOrEqual(node.x - node.r);
    expect(memory.get('a')).toBe('left');
    // Below frees up: it returns to its first choice.
    expect(placeLabel('a', node, size, prefer, [], memory).y).toBe(128);
  });

  it('with no free side, takes the least covered one', () => {
    const everywhere = [{ x: 0, y: 0, w: 200, h: 200 }];
    const r = placeLabel('a', node, size, prefer, everywhere, new Map());
    expect(r).toBeDefined();
  });
});
