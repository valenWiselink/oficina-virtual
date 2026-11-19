/**
 * How often the graph draws. It used to redraw the whole canvas on every
 * animation frame forever — 60 to 180 times a second with nothing moving
 * (measured 2026-11-19), plus a style recalculation each time. Now:
 * - every frame while something happens: you point, drag, zoom or type, a
 *   message brings new views, the layout or the camera is still moving;
 * - a few frames a second once all of that rests, enough for the Clawds'
 *   breathing and floating, which are slow;
 * - nothing at all when there is nothing decorative to show (calm mode, or a
 *   slow PC), until the next event wakes it.
 */
export const ACTIVE_HOLD_MS = 1500;
export const IDLE_FRAME_MS = 1000 / 12;

export interface PacedStage {
  settled(): boolean;
  decorative(): boolean;
}

export interface PaceClock {
  now(): number;
  frame(cb: (now: number) => void): number;
  cancelFrame(id: number): void;
  after(ms: number, cb: () => void): ReturnType<typeof setTimeout>;
  cancelAfter(id: ReturnType<typeof setTimeout>): void;
}

const browserClock: PaceClock = {
  now: () => performance.now(),
  frame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
  after: (ms, cb) => setTimeout(cb, ms),
  cancelAfter: (id) => clearTimeout(id),
};

export interface GraphPace {
  /** Something happened: draw every frame for a moment. */
  wake: () => void;
  stop: () => void;
}

export function createGraphPace(
  draw: (now: number) => void,
  stage: PacedStage,
  clock: PaceClock = browserClock,
): GraphPace {
  let frameId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeUntil = 0;
  let stopped = false;

  const tick = (now: number) => {
    frameId = 0;
    if (stopped) return;
    draw(now);
    schedule(now);
  };

  const schedule = (now: number) => {
    if (now < activeUntil || !stage.settled()) {
      frameId = clock.frame(tick);
    } else if (stage.decorative()) {
      timer = clock.after(IDLE_FRAME_MS, () => {
        timer = undefined;
        if (!stopped) frameId = clock.frame(tick);
      });
    }
    // Otherwise it rests until wake().
  };

  return {
    wake: () => {
      if (stopped) return;
      activeUntil = clock.now() + ACTIVE_HOLD_MS;
      if (timer !== undefined) {
        clock.cancelAfter(timer);
        timer = undefined;
      }
      if (!frameId) frameId = clock.frame(tick);
    },
    stop: () => {
      stopped = true;
      if (frameId) clock.cancelFrame(frameId);
      if (timer !== undefined) clock.cancelAfter(timer);
    },
  };
}
