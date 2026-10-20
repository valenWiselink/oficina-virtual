/** Where the tour's bubble goes beside the element it points at. Pure, so the
 *  geometry is testable without a DOM. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type Side = 'bottom' | 'top' | 'right' | 'left';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * The first side with room for the bubble (below, above, right, left), the
 * bubble centred on the target along that side and kept inside the window.
 * With room nowhere (a target as big as the window) it sits inside, centred.
 */
export function placeBubble(
  target: Rect,
  bubble: Size,
  view: Size,
  gap = 14,
  margin = 12,
): { x: number; y: number; side: Side | 'inside' } {
  const centreX = clamp(target.x + target.w / 2 - bubble.w / 2, margin, view.w - bubble.w - margin);
  const centreY = clamp(target.y + target.h / 2 - bubble.h / 2, margin, view.h - bubble.h - margin);
  if (target.y + target.h + gap + bubble.h + margin <= view.h) {
    return { x: centreX, y: target.y + target.h + gap, side: 'bottom' };
  }
  if (target.y - gap - bubble.h - margin >= 0) {
    return { x: centreX, y: target.y - gap - bubble.h, side: 'top' };
  }
  if (target.x + target.w + gap + bubble.w + margin <= view.w) {
    return { x: target.x + target.w + gap, y: centreY, side: 'right' };
  }
  if (target.x - gap - bubble.w - margin >= 0) {
    return { x: target.x - gap - bubble.w, y: centreY, side: 'left' };
  }
  return {
    x: clamp(view.w / 2 - bubble.w / 2, margin, view.w),
    y: clamp(view.h / 2 - bubble.h / 2, margin, view.h),
    side: 'inside',
  };
}
