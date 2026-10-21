import { type Camera, panBy, type Pt, zoomAt } from './graphCamera.js';

/**
 * The graph's wheel and touch gestures as pure functions (the canvas hook
 * only feeds them events):
 *
 * - Ctrl + wheel, and a touchpad's pinch (Chrome sends it as a wheel with
 *   ctrlKey), zoom toward the pointer.
 * - A touchpad's two-finger scroll pans, both ways.
 * - A real mouse wheel still zooms, as it always did. It is told apart by
 *   its notches: line/page deltas (Firefox), or a vertical-only event whose
 *   legacy `wheelDeltaY` is a multiple of 120 (Chromium on Windows, whatever
 *   the display scaling), else a whole delta of 50 px or more. A whole
 *   stream of events (closer than WHEEL_STREAM_MS) keeps the kind its first
 *   event had, so a fast touchpad flick that happens to send a round 100 px
 *   never turns into a zoom halfway through. Shift + wheel arrives as a
 *   horizontal delta: it pans sideways.
 * - Two fingers on a touch screen pinch: zoom toward their middle and pan
 *   with it.
 */

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey?: boolean;
  /** Chromium's legacy delta: ±120 per mouse notch. */
  wheelDeltaY?: number;
}

export type WheelIntent =
  { kind: 'zoom'; factor: number; at: Pt } | { kind: 'pan'; dx: number; dy: number };

/** A line of a line-mode wheel: three of them make one Chrome notch (100 px). */
const LINE_PX = 33;
const PAGE_PX = 600;
const NOTCH_MIN_PX = 50;
/** Zoom per pixel of a notch (as before) and of a pinch (its deltas are tiny). */
const WHEEL_ZOOM_K = 0.0015;
const PINCH_ZOOM_K = 0.01;
export const WHEEL_STREAM_MS = 250;

/** One event on its own: a mouse wheel's notch, or a touchpad's scroll? */
export function isMouseNotch(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return true;
  if (e.deltaX !== 0) return false;
  if (e.wheelDeltaY) return e.wheelDeltaY % 120 === 0;
  return Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= NOTCH_MIN_PX;
}

/** Remembers the kind of the stream in progress. */
export class WheelStream {
  private last = -Infinity;
  private notch = false;

  isNotch(e: WheelLike, now: number): boolean {
    if (now - this.last > WHEEL_STREAM_MS) this.notch = isMouseNotch(e);
    this.last = now;
    return this.notch;
  }
}

/** What a wheel event does to the camera (`at`: the pointer, screen px). */
export function wheelIntent(e: WheelLike, at: Pt, notch: boolean): WheelIntent {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) {
    return { kind: 'zoom', at, factor: Math.exp(-dy * (notch ? WHEEL_ZOOM_K : PINCH_ZOOM_K)) };
  }
  if (notch) return { kind: 'zoom', at, factor: Math.exp(-dy * WHEEL_ZOOM_K) };
  // Scrolling down shows what is below: the content goes up.
  return { kind: 'pan', dx: -dx, dy: -dy };
}

export function applyWheel(cam: Camera, intent: WheelIntent): Camera {
  return intent.kind === 'zoom'
    ? zoomAt(cam, intent.at, intent.factor)
    : panBy(cam, intent.dx, intent.dy);
}

const middle = ([a, b]: readonly [Pt, Pt]): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const spread = ([a, b]: readonly [Pt, Pt]): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Two fingers moved from `prev` to `next` (screen px): zoom by how much
 *  they spread, toward their middle, and follow the middle. */
export function pinchStep(cam: Camera, prev: readonly [Pt, Pt], next: readonly [Pt, Pt]): Camera {
  const before = spread(prev);
  const factor = before > 0 ? spread(next) / before : 1;
  const m0 = middle(prev);
  const m1 = middle(next);
  return panBy(zoomAt(cam, m0, factor), m1.x - m0.x, m1.y - m0.y);
}
