/** A node of the live graph: an agent, a subagent, or a fixed landmark. */
export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Where the node wants to be (it is pulled there, never teleported). */
  ax: number;
  ay: number;
  /** Family: a lead and its subagents share one (they may sit close). */
  group?: string;
  /** Extra room kept from other families (a meeting's whole circle). */
  pad?: number;
}

export interface SimEdge {
  a: string;
  b: string;
  length: number;
  strength: number;
}

/** Spring toward the anchor, edge springs, and repulsion so nodes never overlap. */
const ANCHOR_PULL = 4;
const REPEL = 14;
const DAMPING = 4.5;
const LABEL_ROOM = 34;

/**
 * One damped step of the layout: collaborators attract (edges), everybody
 * keeps a label's room apart, and each node drifts toward where its state
 * puts it (near "Vos" when it needs you, near the library when researching).
 */
export function stepGraph(
  nodes: Map<string, SimNode>,
  edges: SimEdge[],
  dt: number,
  bounds: { w: number; h: number; margin: number },
  /** A node you hold: it passes over the others without pushing them away
   *  (so you can drop it on one). */
  ghost?: string,
): void {
  const list = [...nodes.values()];
  const fx = new Map<string, { x: number; y: number }>();
  for (const n of list)
    fx.set(n.id, { x: (n.ax - n.x) * ANCHOR_PULL, y: (n.ay - n.y) * ANCHOR_PULL });

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.id === ghost || b.id === ghost) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const family = a.group !== undefined && a.group === b.group;
      const min = a.r + b.r + LABEL_ROOM + (family ? 0 : (a.pad ?? 0) + (b.pad ?? 0));
      if (d >= min) continue;
      const f = (min - d) * REPEL;
      fx.get(a.id)!.x -= (dx / d) * f;
      fx.get(a.id)!.y -= (dy / d) * f;
      fx.get(b.id)!.x += (dx / d) * f;
      fx.get(b.id)!.y += (dy / d) * f;
    }
  }

  for (const e of edges) {
    const a = nodes.get(e.a);
    const b = nodes.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const f = (d - e.length) * e.strength;
    fx.get(a.id)!.x += (dx / d) * f;
    fx.get(a.id)!.y += (dy / d) * f;
    fx.get(b.id)!.x -= (dx / d) * f;
    fx.get(b.id)!.y -= (dy / d) * f;
  }

  const h = Math.min(dt, 0.05);
  const damp = Math.exp(-DAMPING * h);
  for (const n of list) {
    const f = fx.get(n.id)!;
    n.vx = (n.vx + f.x * h) * damp;
    n.vy = (n.vy + f.y * h) * damp;
    n.x = Math.min(bounds.w - bounds.margin, Math.max(bounds.margin, n.x + n.vx * h));
    n.y = Math.min(bounds.h - bounds.margin, Math.max(bounds.margin, n.y + n.vy * h));
  }
}
