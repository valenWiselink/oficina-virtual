import type { Pt } from './graphCamera.js';
import { type GraphTarget, targetKey } from './graphHit.js';

/**
 * Every pointer on the graph's canvas, by its pointerId (mouse, pen or
 * fingers), turned into gestures. No DOM here (the canvas hook feeds it
 * positions), so touch is testable:
 * - one pointer: a click, or a drag — of an agent or member (it moves), of
 *   the minimap's frame (the view follows), else of the background (pan);
 * - a second finger turns it into a pinch (zoom toward the middle, and pan),
 *   and whatever was held is let go where it was; lifting one finger goes on
 *   panning with the other, never a click;
 * - a click on the same target as the one just before is a repeat (the
 *   second half of a double click): the host centres instead of selecting;
 * - a finger held still for LONG_PRESS_MS is a long press (the touch
 *   equivalent of a right click): no click follows it;
 * - Shift + drag on the background draws a box (to pick several), and a
 *   click with Ctrl says so (to add one to the pick).
 */

/** A drag shorter than this is a click. */
export const CLICK_SLOP_PX = 4;
/** Two clicks on the same thing this close in time make a double click. */
export const DOUBLE_CLICK_MS = 400;
/** A finger held still this long opens the menu. */
export const LONG_PRESS_MS = 550;

export type Grab = { id: number; member?: number };
/** Keys held when the press started. */
export type Mods = { shift: boolean; ctrl: boolean };
const NO_MODS: Mods = { shift: false, ctrl: false };

export interface PointerHost {
  targetAt(p: Pt): GraphTarget | null;
  /** The background dragged by (dx, dy) screen px. */
  pan(dx: number, dy: number): void;
  pinch(prev: [Pt, Pt], next: [Pt, Pt]): void;
  /** Dragging the minimap's frame: the view centres on what is under p. */
  minimapTo(p: Pt): void;
  /** An agent or member held under the pointer (screen px). */
  hold(grab: Grab, p: Pt): void;
  /** Let go: `keep` where it was dropped (false: a pinch took over). */
  release(grab: Grab, keep: boolean): void;
  /** A click (null target: the background); `repeat`: the same target was
   *  clicked just before. */
  click(target: GraphTarget | null, p: Pt, repeat: boolean, mods?: Mods): void;
  /** Shift + drag on the background: the box from `from` to `to`
   *  (screen px); `done` when the button is let go. */
  box?(from: Pt, to: Pt, done: boolean): void;
  /** A finger held still on something (or the background). */
  longPress?(target: GraphTarget | null, p: Pt): void;
}

interface Press {
  id: number;
  start: Pt;
  last: Pt;
  dragging: boolean;
  target: GraphTarget | null;
  /** When it went down and whether by a finger (a long press needs both). */
  at: number;
  touch: boolean;
  mods: Mods;
  /** A long press already used it: nothing else happens. */
  used?: boolean;
}

const grabOf = (t: GraphTarget | null): Grab | null =>
  t?.type === 'agent' ? { id: t.id, member: t.member } : null;

export class PointerTracker {
  private readonly pointers = new Map<number, Pt>();
  private press: Press | null = null;
  private pinchIds: [number, number] | null = null;
  private lastClick = { key: '\0', at: -Infinity };

  private readonly host: PointerHost;

  constructor(host: PointerHost) {
    this.host = host;
  }

  /** Something is pressed (the hover card waits). */
  get busy(): boolean {
    return this.pointers.size > 0;
  }

  down(id: number, p: Pt, now = 0, touch = false, mods: Mods = NO_MODS): void {
    this.pointers.set(id, p);
    if (this.pointers.size === 1) {
      const target = this.host.targetAt(p);
      this.press = { id, start: p, last: p, dragging: false, target, at: now, touch, mods };
      return;
    }
    if (this.pointers.size === 2 && this.press) this.startPinch(id);
  }

  private startPinch(second: number): void {
    const press = this.press!;
    const grab = grabOf(press.target);
    if (grab && press.dragging) this.host.release(grab, false);
    press.dragging = true;
    press.target = null;
    this.pinchIds = [press.id, second];
  }

  move(id: number, p: Pt): void {
    const before = this.pointers.get(id);
    if (!before) return;
    if (this.pinchIds?.includes(id)) {
      const prev = this.pair();
      this.pointers.set(id, p);
      if (prev) this.host.pinch(prev, this.pair()!);
      return;
    }
    this.pointers.set(id, p);
    const press = this.press;
    if (!press || press.id !== id || this.pinchIds || press.used) return;
    if (!press.dragging && Math.hypot(p.x - press.start.x, p.y - press.start.y) < CLICK_SLOP_PX)
      return;
    press.dragging = true;
    this.drag(press, p);
    press.last = p;
  }

  private boxing(press: Press): boolean {
    const t = press.target;
    return press.mods.shift && !!this.host.box && (!t || t.type === 'passive');
  }

  private drag(press: Press, p: Pt): void {
    const grab = grabOf(press.target);
    if (this.boxing(press)) this.host.box!(press.start, p, false);
    else if (grab) this.host.hold(grab, p);
    else if (press.target?.type === 'minimap') this.host.minimapTo(p);
    else this.host.pan(p.x - press.last.x, p.y - press.last.y);
  }

  private pair(): [Pt, Pt] | null {
    if (!this.pinchIds) return null;
    const a = this.pointers.get(this.pinchIds[0]);
    const b = this.pointers.get(this.pinchIds[1]);
    return a && b ? [a, b] : null;
  }

  up(id: number, p: Pt, now: number): void {
    this.end(id, p, now, true);
  }

  /** Drop what is pressed (Esc while dragging): nothing more happens with
   *  it, not even its release. */
  abort(): void {
    if (this.press) this.press.used = true;
  }

  /** The browser took the pointer (a system gesture): never a click. */
  cancel(id: number): void {
    this.end(id, this.pointers.get(id) ?? { x: 0, y: 0 }, 0, false);
  }

  private end(id: number, p: Pt, now: number, clean: boolean): void {
    if (!this.pointers.delete(id)) return;
    if (this.pinchIds?.includes(id)) {
      this.pinchIds = null;
      // The finger left on the glass goes on panning from where it is.
      const [rest] = [...this.pointers.entries()];
      this.press = rest
        ? {
            id: rest[0],
            start: rest[1],
            last: rest[1],
            dragging: true,
            target: null,
            at: 0,
            touch: true,
            mods: NO_MODS,
          }
        : null;
      return;
    }
    const press = this.press;
    if (!press || press.id !== id) return;
    this.press = null;
    if (press.used) return;
    const grab = grabOf(press.target);
    if (press.dragging) {
      if (this.boxing(press)) this.host.box!(press.start, clean ? p : press.start, true);
      else if (grab) this.host.release(grab, clean);
      return;
    }
    if (clean) this.clickAt(press.target, p, now, press.mods);
  }

  /** Each frame: a finger held still long enough becomes a long press. */
  tick(now: number): void {
    const press = this.press;
    if (!press || !press.touch || press.dragging || press.used || this.pinchIds) return;
    if (now - press.at < LONG_PRESS_MS) return;
    press.used = true;
    this.host.longPress?.(press.target, press.start);
  }

  private clickAt(target: GraphTarget | null, p: Pt, now: number, mods: Mods): void {
    const key = targetKey(target);
    const repeat = key === this.lastClick.key && now - this.lastClick.at < DOUBLE_CLICK_MS;
    this.lastClick = { key, at: now };
    this.host.click(target, p, repeat, mods);
  }
}
