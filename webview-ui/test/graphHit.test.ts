import { describe, expect, it } from 'vitest';

import { type HitScene, hitTest, segmentDistance, targetKey } from '../src/views/graphHit.js';

const cam = { x: 0, y: 0, zoom: 1 };

/** A lead (id 1) at (300, 300) with a member (id -7) at (420, 300); a pill,
 *  the library, a supervisor's line and a file chip. */
function scene(): HitScene {
  return {
    hits: [
      { id: 1, disc: { x: 300, y: 300, r: 40 }, label: { x: 280, y: 350, w: 90, h: 38 } },
      { id: 1, member: -7, disc: { x: 420, y: 300, r: 22 } },
    ],
    vos: { x: 50, y: 40, w: 60, h: 32 },
    arrows: [{ id: 3, box: { x: 0, y: 500, w: 40, h: 30 } }],
    pills: [{ id: 2, box: { x: 150, y: 150, w: 80, h: 22 } }],
    passive: {
      boxes: [{ x: 600, y: 100, w: 70, h: 20 }],
      circles: [{ x: 900, y: 600, r: 120 }],
      segments: [
        [
          { x: 500, y: 500 },
          { x: 700, y: 500 },
        ],
      ],
    },
  };
}

describe('hitTest', () => {
  it('a member names itself and its lead (dragging it must not move the lead)', () => {
    expect(hitTest(scene(), cam, { x: 425, y: 305 }, null)).toEqual({
      type: 'agent',
      id: 1,
      member: -7,
    });
    expect(hitTest(scene(), cam, { x: 300, y: 300 }, null)).toEqual({ type: 'agent', id: 1 });
    expect(hitTest(scene(), cam, { x: 300, y: 370 }, null)).toEqual({ type: 'agent', id: 1 });
  });

  it('knows "Vos", the request pills and the border arrows', () => {
    expect(hitTest(scene(), cam, { x: 70, y: 50 }, null)).toEqual({ type: 'vos' });
    expect(hitTest(scene(), cam, { x: 160, y: 160 }, null)).toEqual({ type: 'pill', id: 2 });
    expect(hitTest(scene(), cam, { x: 10, y: 510 }, null)).toEqual({ type: 'arrow', id: 3 });
  });

  it('the library, a line and a file chip are not the background', () => {
    expect(hitTest(scene(), cam, { x: 900, y: 650 }, null)).toEqual({ type: 'passive' });
    expect(hitTest(scene(), cam, { x: 600, y: 503 }, null)).toEqual({ type: 'passive' });
    expect(hitTest(scene(), cam, { x: 610, y: 110 }, null)).toEqual({ type: 'passive' });
    expect(hitTest(scene(), cam, { x: 600, y: 520 }, null)).toBeNull();
  });

  it('a line keeps its slack in screen pixels whatever the zoom', () => {
    const far = { x: 0, y: 0, zoom: 0.5 };
    // 8 world px off the line = 4 screen px at half zoom: still on it.
    expect(hitTest(scene(), far, { x: 300, y: 254 }, null)).toEqual({ type: 'passive' });
  });

  it('the minimap is on top of the world', () => {
    const minimap = { x: 280, y: 280, w: 50, h: 50 };
    expect(hitTest(scene(), cam, { x: 300, y: 300 }, minimap)).toEqual({ type: 'minimap' });
  });

  it('works in world coordinates through the camera', () => {
    const zoomed = { x: 200, y: 200, zoom: 2 };
    // Screen (200, 200) is world (300, 300): the lead.
    expect(hitTest(scene(), zoomed, { x: 200, y: 200 }, null)).toEqual({ type: 'agent', id: 1 });
  });
});

describe('segmentDistance / targetKey', () => {
  it('measures to the nearest point of the segment', () => {
    expect(segmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(segmentDistance({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(segmentDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(Math.SQRT2);
  });

  it('tells a lead from its member', () => {
    expect(targetKey({ type: 'agent', id: 1 })).not.toBe(
      targetKey({ type: 'agent', id: 1, member: -7 }),
    );
    expect(targetKey(null)).toBe('');
  });
});
