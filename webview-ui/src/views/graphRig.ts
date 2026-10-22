import type { Insets } from '../components/cardBar.js';
import {
  type Bounds,
  type Camera,
  centerOn,
  fitCamera,
  type Frame,
  fromFrame,
  intoFrame,
  isVisible,
  type Pt,
  type ViewSize,
  zoomAt,
} from './graphCamera.js';

/** How much of the way the camera goes each frame: fitting, following, the rest. */
const FIT_EASE = 0.08;
const FOLLOW_EASE = 0.12;
const MOVE_EASE = 0.18;
const FIT_PADDING = 60;

/** Ease the camera toward a target, a little each frame. */
function approach(cam: Camera, target: Camera, k: number): Camera {
  return {
    x: cam.x + (target.x - cam.x) * k,
    y: cam.y + (target.y - cam.y) * k,
    zoom: cam.zoom + (target.zoom - cam.zoom) * k,
  };
}

/**
 * Where the graph's camera is and where it is going: fitting everyone,
 * gliding to a spot, or going along with one agent ("Seguir"). In calm mode
 * it jumps instead of gliding. Moving it by hand (drag, wheel, pinch, arrows,
 * the minimap) ends fitting and following. Centring and fitting keep to the
 * part of the view the strip of tabs leaves uncovered (`inset`). No canvas
 * here: tested on its own.
 */
export class CameraRig {
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  target: Camera | null = null;
  autoFit = true;
  /** The agent the camera goes along with. */
  following: number | null = null;
  view: ViewSize = { w: 0, h: 0 };
  /** What the see-through strip of agent tabs covers at each side (screen px). */
  inset: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  calm = false;
  /** The zoom asked for while following (the buttons, + and −). */
  private followZoom: number | null = null;

  private readonly onFollow: (id: number | null) => void;

  constructor(onFollow: (id: number | null) => void = () => {}) {
    this.onFollow = onFollow;
  }

  /** Glide (or, in calm mode, jump) to `target`; fitting stops. */
  go(target: Camera): void {
    this.autoFit = false;
    if (this.calm) {
      this.cam = target;
      this.target = null;
    } else {
      this.target = target;
    }
  }

  /** Moved by hand: it stays where you put it. */
  moveTo(next: Camera): void {
    this.autoFit = false;
    this.target = null;
    this.cam = next;
    this.follow(null);
  }

  fit(): void {
    this.follow(null);
    this.autoFit = true;
  }

  /** The part of the view the strip leaves uncovered. */
  frame(): Frame {
    const { top, right, bottom, left } = this.inset;
    return { x: left, y: top, w: this.view.w - left - right, h: this.view.h - top - bottom };
  }

  /** The camera with world point `p` in the middle of the frame. */
  centered(p: Pt, zoom = this.cam.zoom): Camera {
    const f = this.frame();
    return fromFrame(centerOn(this.cam, p, f, zoom), f);
  }

  /** Glide to show all of `b` inside the frame. */
  fitTo(b: Bounds, padding: number): void {
    const f = this.frame();
    this.go(fromFrame(fitCamera(b, f, padding), f));
  }

  /** Zoom around the middle of the frame (still following, when it was). */
  zoomBy(factor: number): void {
    const f = this.frame();
    const goal = zoomAt(this.target ?? this.cam, { x: f.x + f.w / 2, y: f.y + f.h / 2 }, factor);
    if (this.following !== null) this.followZoom = goal.zoom;
    else this.go(goal);
  }

  /** Centre a world point, at `zoom` (default: as it is). */
  centerOn(p: Pt, zoom = this.cam.zoom): void {
    this.go(this.centered(p, zoom));
  }

  /** Bring a point into view only when it is out of frame (`margin`: how
   *  far inside the border still counts as out, screen px). */
  reveal(p: Pt, margin = 0): void {
    const f = this.frame();
    if (!isVisible(intoFrame(this.cam, f), f, p, -margin)) this.centerOn(p);
  }

  follow(id: number | null): void {
    if (this.following === id) return;
    this.following = id;
    this.followZoom = null;
    if (id !== null) this.autoFit = false;
    this.onFollow(id);
  }

  /** One frame: aim (everyone inside `fit`, or the followed agent at
   *  `followed`; gone = stop following) and take a step there. */
  step(content: Bounds | null, fit: ViewSize & Partial<Pt>, followed: Pt | undefined): void {
    if (this.following !== null && !followed) this.follow(null);
    if (this.following !== null && followed) {
      this.target = this.centered(followed, this.followZoom ?? this.cam.zoom);
    } else if (this.autoFit && content) {
      const at = { x: fit.x ?? 0, y: fit.y ?? 0 };
      this.target = fromFrame(fitCamera(content, fit, FIT_PADDING), at);
    }
    const target = this.target;
    if (!target) return;
    const k = this.calm
      ? 1
      : this.following !== null
        ? FOLLOW_EASE
        : this.autoFit
          ? FIT_EASE
          : MOVE_EASE;
    this.cam = approach(this.cam, target, k);
    const arrived =
      Math.abs(this.cam.zoom - target.zoom) < 0.001 &&
      Math.abs(this.cam.x - target.x) < 0.5 &&
      Math.abs(this.cam.y - target.y) < 0.5;
    if (arrived) {
      this.cam = target;
      if (!this.autoFit && this.following === null) this.target = null;
    }
  }
}
