import { describe, expect, it } from 'vitest';

import { toWorld } from '../src/views/graphCamera.js';
import {
  applyWheel,
  isMouseNotch,
  pinchStep,
  wheelIntent,
  type WheelLike,
  WheelStream,
} from '../src/views/graphGestures.js';

const wheel = (over: Partial<WheelLike>): WheelLike => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  ...over,
});
const at = { x: 400, y: 300 };
const cam = { x: 0, y: 0, zoom: 1 };

describe('wheel: mouse or touchpad', () => {
  it('a mouse notch (±120 legacy delta, any display scaling) zooms', () => {
    expect(isMouseNotch(wheel({ deltaY: 100, wheelDeltaY: -120 }))).toBe(true);
    expect(isMouseNotch(wheel({ deltaY: 125, wheelDeltaY: -120 }))).toBe(true);
    expect(isMouseNotch(wheel({ deltaY: 3, deltaMode: 1 }))).toBe(true);
    const intent = wheelIntent(wheel({ deltaY: 100, wheelDeltaY: -120 }), at, true);
    expect(intent.kind).toBe('zoom');
    expect(intent.kind === 'zoom' && intent.factor).toBeLessThan(1);
  });

  it('a touchpad scroll pans both ways, with the fingers', () => {
    const e = wheel({ deltaX: 12, deltaY: -7.5, wheelDeltaY: 9 });
    expect(isMouseNotch(e)).toBe(false);
    expect(wheelIntent(e, at, false)).toEqual({ kind: 'pan', dx: -12, dy: 7.5 });
    // Scrolling down shows what is below: the world moves up on screen.
    const after = applyWheel(cam, wheelIntent(wheel({ deltaY: 40 }), at, false));
    expect(after.y).toBe(40);
    expect(after.zoom).toBe(1);
  });

  it('Shift + wheel (a horizontal delta) pans sideways', () => {
    const e = wheel({ deltaX: 100 });
    expect(isMouseNotch(e)).toBe(false);
    expect(wheelIntent(e, at, isMouseNotch(e))).toEqual({ kind: 'pan', dx: -100, dy: -0 });
  });

  it('a pinch (wheel with ctrlKey) zooms toward the pointer, harder per pixel', () => {
    const pinch = wheelIntent(wheel({ deltaY: -4.2, ctrlKey: true }), at, false);
    const notch = wheelIntent(wheel({ deltaY: -4.2, ctrlKey: true }), at, true);
    expect(pinch.kind).toBe('zoom');
    if (pinch.kind !== 'zoom' || notch.kind !== 'zoom') return;
    expect(pinch.factor).toBeGreaterThan(notch.factor);
    const before = toWorld(cam, at);
    const after = applyWheel(cam, pinch);
    expect(toWorld(after, at).x).toBeCloseTo(before.x);
    expect(after.zoom).toBeGreaterThan(1);
  });

  it('a stream keeps the kind of its first event', () => {
    const stream = new WheelStream();
    expect(stream.isNotch(wheel({ deltaY: 6 }), 0)).toBe(false);
    // A fast flick that happens to send a round 100 px: still the touchpad.
    expect(stream.isNotch(wheel({ deltaY: 100 }), 30)).toBe(false);
    // After a pause, a mouse notch starts its own stream.
    expect(stream.isNotch(wheel({ deltaY: 100, wheelDeltaY: -120 }), 600)).toBe(true);
  });
});

describe('pinchStep', () => {
  it('spreading two fingers zooms toward their middle', () => {
    const prev: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 300, y: 300 },
      { x: 500, y: 300 },
    ];
    const next: typeof prev = [
      { x: 200, y: 300 },
      { x: 600, y: 300 },
    ];
    const before = toWorld(cam, { x: 400, y: 300 });
    const after = pinchStep(cam, prev, next);
    expect(after.zoom).toBeCloseTo(2);
    expect(toWorld(after, { x: 400, y: 300 }).x).toBeCloseTo(before.x);
    expect(toWorld(after, { x: 400, y: 300 }).y).toBeCloseTo(before.y);
  });

  it('moving both fingers pans with them', () => {
    const after = pinchStep(
      cam,
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 130, y: 120 },
        { x: 230, y: 120 },
      ],
    );
    expect(after.zoom).toBeCloseTo(1);
    expect(after.x).toBeCloseTo(-30);
    expect(after.y).toBeCloseTo(-20);
  });
});
