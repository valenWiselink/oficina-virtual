/**
 * The graph's camera: nodes live in a fixed-size world and the camera says
 * which part of it the canvas shows and how big. Pure math, so zooming,
 * panning and fitting are testable without a canvas.
 */

export interface Camera {
  /** World point at the canvas' top-left corner. */
  x: number;
  y: number;
  zoom: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ViewSize {
  w: number;
  h: number;
}

/** A part of the view (screen px): its top-left corner and its size. */
export interface Frame extends Pt, ViewSize {}

/** The camera as seen from a frame's own top-left corner (screen points
 *  then count from there), and back. */
export function intoFrame(cam: Camera, f: Pt): Camera {
  return { ...cam, x: cam.x + f.x / cam.zoom, y: cam.y + f.y / cam.zoom };
}

export function fromFrame(cam: Camera, f: Pt): Camera {
  return { ...cam, x: cam.x - f.x / cam.zoom, y: cam.y - f.y / cam.zoom };
}

export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 3;
/** Fitting never blows a small graph up past this. */
export const FIT_ZOOM_MAX = 1.3;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export function toScreen(cam: Camera, p: Pt): Pt {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

export function toWorld(cam: Camera, p: Pt): Pt {
  return { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
}

/** Zoom by `factor`, keeping the world point under `at` (screen) still. */
export function zoomAt(cam: Camera, at: Pt, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const anchor = toWorld(cam, at);
  return { zoom, x: anchor.x - at.x / zoom, y: anchor.y - at.y / zoom };
}

/** Move the view by a drag of (dx, dy) screen pixels (content follows the mouse). */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}

/** Put a world point at the centre of the view, optionally at a new zoom. */
export function centerOn(cam: Camera, p: Pt, view: ViewSize, zoom = cam.zoom): Camera {
  const z = clampZoom(zoom);
  return { zoom: z, x: p.x - view.w / 2 / z, y: p.y - view.h / 2 / z };
}

/** The camera that shows all of `b` with `padding` screen px around it. */
export function fitCamera(b: Bounds, view: ViewSize, padding = 60): Camera {
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const zoom = clampZoom(
    Math.min(FIT_ZOOM_MAX, (view.w - padding * 2) / bw, (view.h - padding * 2) / bh),
  );
  return centerOn(
    { x: 0, y: 0, zoom },
    { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    view,
    zoom,
  );
}

/** Is the world point inside the view (with `margin` screen px of slack)? */
export function isVisible(cam: Camera, view: ViewSize, p: Pt, margin = 0): boolean {
  const s = toScreen(cam, p);
  return s.x >= -margin && s.y >= -margin && s.x <= view.w + margin && s.y <= view.h + margin;
}

/**
 * Where on the view's border (inset by `inset` px) the arrow toward an
 * off-screen world point goes, and the direction it points.
 */
export function edgeArrow(
  cam: Camera,
  view: ViewSize,
  p: Pt,
  inset: number,
): { x: number; y: number; angle: number } {
  const s = toScreen(cam, p);
  const cx = view.w / 2;
  const cy = view.h / 2;
  const dx = s.x - cx;
  const dy = s.y - cy;
  const angle = Math.atan2(dy, dx);
  const hx = cx - inset;
  const hy = cy - inset;
  const scale = Math.min(
    dx === 0 ? Infinity : hx / Math.abs(dx),
    dy === 0 ? Infinity : hy / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale, angle };
}
