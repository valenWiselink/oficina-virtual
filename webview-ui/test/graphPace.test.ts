import { describe, expect, it } from 'vitest';

import {
  ACTIVE_HOLD_MS,
  createGraphPace,
  IDLE_FRAME_MS,
  type PaceClock,
} from '../src/views/graphPace.js';

/** A clock that runs frames and timers by hand, one 16 ms frame at a time. */
function fakeClock() {
  let t = 0;
  let nextId = 1;
  const frames = new Map<number, (now: number) => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: PaceClock = {
    now: () => t,
    frame: (cb) => {
      frames.set(nextId, cb);
      return nextId++;
    },
    cancelFrame: (id) => frames.delete(id),
    after: (ms, cb) => {
      timers.set(nextId, { at: t + ms, cb });
      return nextId++ as unknown as ReturnType<typeof setTimeout>;
    },
    cancelAfter: (id) => timers.delete(id as unknown as number),
  };
  /** Advance `ms`, running due timers and one pending frame per 16 ms. */
  const run = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += 16;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= t) {
          timers.delete(id);
          timer.cb();
        }
      }
      for (const [id, cb] of [...frames]) {
        frames.delete(id);
        cb(t);
      }
    }
  };
  return { clock, run };
}

function setup(stage: { settled: boolean; decorative: boolean }) {
  const { clock, run } = fakeClock();
  let draws = 0;
  const pace = createGraphPace(
    () => draws++,
    { settled: () => stage.settled, decorative: () => stage.decorative },
    clock,
  );
  return { pace, run, draws: () => draws };
}

describe('graph pace', () => {
  it('draws every frame while woken, then a few a second at rest', () => {
    const s = setup({ settled: true, decorative: true });
    s.pace.wake();
    s.run(ACTIVE_HOLD_MS);
    const active = s.draws();
    expect(active).toBeGreaterThan(80); // ~60 fps
    s.run(5000);
    const idlePerSecond = (s.draws() - active) / 5;
    expect(idlePerSecond).toBeLessThanOrEqual(1000 / IDLE_FRAME_MS);
    expect(idlePerSecond).toBeGreaterThan(5);
  });

  it('stops drawing when nothing is decorative and everything rests', () => {
    const s = setup({ settled: true, decorative: false });
    s.pace.wake();
    s.run(ACTIVE_HOLD_MS + 100);
    const before = s.draws();
    s.run(10_000);
    expect(s.draws()).toBe(before);
    s.pace.wake();
    s.run(100);
    expect(s.draws()).toBeGreaterThan(before);
  });

  it('keeps every frame while the layout or camera still moves', () => {
    const stage = { settled: false, decorative: false };
    const s = setup(stage);
    s.pace.wake();
    s.run(4000);
    expect(s.draws()).toBeGreaterThan(200);
    stage.settled = true;
    const at = s.draws();
    s.run(4000);
    expect(s.draws() - at).toBeLessThan(3);
  });

  it('draws nothing after stop', () => {
    const s = setup({ settled: false, decorative: true });
    s.pace.wake();
    s.run(100);
    s.pace.stop();
    const at = s.draws();
    s.run(2000);
    expect(s.draws()).toBe(at);
  });
});
