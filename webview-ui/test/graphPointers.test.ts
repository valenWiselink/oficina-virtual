import { describe, expect, it } from 'vitest';

import type { Pt } from '../src/views/graphCamera.js';
import type { GraphTarget } from '../src/views/graphHit.js';
import {
  DOUBLE_CLICK_MS,
  type Grab,
  LONG_PRESS_MS,
  PointerTracker,
} from '../src/views/graphPointers.js';

/** A host that records what the tracker asked for; `at` says what is under
 *  each point (by its x: 100 = a lead, 200 = its member, 300 = the minimap). */
function host() {
  const log: string[] = [];
  const at = (p: Pt): GraphTarget | null =>
    p.x === 100
      ? { type: 'agent', id: 1 }
      : p.x === 200
        ? { type: 'agent', id: 1, member: -7 }
        : p.x === 300
          ? { type: 'minimap' }
          : null;
  const grab = (g: Grab) => (g.member !== undefined ? `member ${g.member}` : `agent ${g.id}`);
  return {
    log,
    host: {
      targetAt: at,
      pan: (dx: number, dy: number) => log.push(`pan ${dx},${dy}`),
      pinch: (prev: [Pt, Pt], next: [Pt, Pt]) =>
        log.push(`pinch ${prev[1].x - prev[0].x}->${next[1].x - next[0].x}`),
      minimapTo: (p: Pt) => log.push(`minimap ${p.x},${p.y}`),
      hold: (g: Grab, p: Pt) => log.push(`hold ${grab(g)} at ${p.x},${p.y}`),
      release: (g: Grab, keep: boolean) => log.push(`release ${grab(g)} ${keep ? 'keep' : 'drop'}`),
      longPress: (t: GraphTarget | null) => log.push(`long ${t ? t.type : 'background'}`),
      click: (t: GraphTarget | null, _p: Pt, repeat: boolean) =>
        log.push(`click ${t ? t.type : 'background'}${repeat ? ' again' : ''}`),
    },
  };
}

describe('PointerTracker', () => {
  it('a press without moving is a click', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 100, y: 0 });
    t.move(1, { x: 102, y: 1 });
    t.up(1, { x: 102, y: 1 }, 0);
    expect(log).toEqual(['click agent']);
  });

  it('dragging a member holds the member, never its lead', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 200, y: 0 });
    t.move(1, { x: 200, y: 30 });
    t.up(1, { x: 200, y: 30 }, 0);
    expect(log).toEqual(['hold member -7 at 200,30', 'release member -7 keep']);
  });

  it('dragging the background pans by what each event moved', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 0, y: 0 });
    t.move(1, { x: 10, y: 0 });
    t.move(1, { x: 15, y: 5 });
    t.up(1, { x: 15, y: 5 }, 0);
    expect(log).toEqual(['pan 10,0', 'pan 5,5']);
  });

  it('dragging on the minimap moves its frame (the view), not the world', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 300, y: 10 });
    t.move(1, { x: 300, y: 30 });
    t.up(1, { x: 300, y: 30 }, 0);
    expect(log).toEqual(['minimap 300,30']);
  });

  it('a second finger turns it into a pinch and lets go of what it held', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 100, y: 0 });
    t.move(1, { x: 100, y: 20 });
    t.down(2, { x: 140, y: 20 });
    t.move(2, { x: 180, y: 20 });
    expect(log).toEqual(['hold agent 1 at 100,20', 'release agent 1 drop', 'pinch 40->80']);
  });

  it('lifting one finger goes on panning with the other, never a click', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 50, y: 0 });
    t.up(2, { x: 50, y: 0 }, 0);
    t.move(1, { x: 0, y: 8 });
    t.up(1, { x: 0, y: 8 }, 10);
    expect(log).toEqual(['pan 0,8']);
    expect(t.busy).toBe(false);
  });

  it('only the pressed finger moves the view (another one does not)', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 0, y: 0 });
    t.move(9, { x: 40, y: 40 });
    t.up(9, { x: 40, y: 40 }, 0);
    expect(log).toEqual([]);
  });

  it('a second click on the same thing soon after is a repeat', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    const click = (x: number, at: number) => {
      t.down(1, { x, y: 0 });
      t.up(1, { x, y: 0 }, at);
    };
    click(100, 0);
    click(100, 200);
    click(200, 300);
    click(200, 300 + DOUBLE_CLICK_MS + 1);
    expect(log).toEqual(['click agent', 'click agent again', 'click agent', 'click agent']);
  });

  it('a cancelled pointer is never a click', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 100, y: 0 });
    t.cancel(1);
    expect(log).toEqual([]);
  });

  it('a finger held still is a long press, and no click follows', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 100, y: 0 }, 1000, true);
    t.tick(1000 + LONG_PRESS_MS - 1);
    t.move(1, { x: 101, y: 1 });
    t.tick(1000 + LONG_PRESS_MS);
    t.up(1, { x: 101, y: 1 }, 1000 + LONG_PRESS_MS + 50);
    expect(log).toEqual(['long agent']);
  });

  it('a mouse never long-presses, and a moving finger neither', () => {
    const { log, host: h } = host();
    const t = new PointerTracker(h);
    t.down(1, { x: 100, y: 0 }, 0, false);
    t.tick(5000);
    t.up(1, { x: 100, y: 0 }, 5000);
    t.down(2, { x: 0, y: 0 }, 6000, true);
    t.move(2, { x: 30, y: 0 });
    t.tick(6000 + LONG_PRESS_MS * 2);
    t.up(2, { x: 30, y: 0 }, 9000);
    expect(log).toEqual(['click agent', 'pan 30,0']);
  });
});
