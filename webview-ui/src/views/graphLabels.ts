/**
 * Where a node's label goes: below it by default, else beside or above —
 * the first place that covers no other node or label. The choice sticks
 * while it stays free, so labels do not jump around frame to frame.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'below' | 'left' | 'right' | 'above';

const GAP = 8;

export function overlap(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

export function sideRect(
  side: Side,
  node: { x: number; y: number; r: number },
  size: { w: number; h: number },
): Rect {
  switch (side) {
    case 'below':
      return { x: node.x - size.w / 2, y: node.y + node.r + GAP, ...size };
    case 'above':
      return { x: node.x - size.w / 2, y: node.y - node.r - GAP - size.h, ...size };
    case 'left':
      return { x: node.x - node.r - GAP - size.w, y: node.y - size.h / 2, ...size };
    case 'right':
      return { x: node.x + node.r + GAP, y: node.y - size.h / 2, ...size };
  }
}

/** The label's box for this node, avoiding `obstacles` (nodes and labels placed so far). */
export function placeLabel(
  key: string,
  node: { x: number; y: number; r: number },
  size: { w: number; h: number },
  prefer: Side[],
  obstacles: Rect[],
  memory: Map<string, Side>,
): Rect {
  const cost = (r: Rect) => obstacles.reduce((sum, o) => sum + overlap(r, o), 0);
  const kept = memory.get(key);
  if (kept && prefer.includes(kept)) {
    const r = sideRect(kept, node, size);
    // Stay put while free, and while the preferred first side is still taken.
    if (cost(r) === 0 && (kept === prefer[0] || cost(sideRect(prefer[0], node, size)) > 0)) {
      return r;
    }
  }
  let best: { side: Side; rect: Rect; cost: number } | null = null;
  for (const side of prefer) {
    const rect = sideRect(side, node, size);
    const c = cost(rect);
    if (c === 0) {
      best = { side, rect, cost: 0 };
      break;
    }
    if (!best || c < best.cost) best = { side, rect, cost: c };
  }
  memory.set(key, best!.side);
  return best!.rect;
}
