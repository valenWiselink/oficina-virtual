import { describe, expect, it } from 'vitest';

import { type SimNode, stepGraph } from '../src/views/graphSim.js';

const node = (id: string, x: number, y: number, ax = x, ay = y): SimNode => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  r: 20,
  ax,
  ay,
});

function run(nodes: Map<string, SimNode>, edges = [] as Parameters<typeof stepGraph>[1]) {
  for (let i = 0; i < 400; i++) stepGraph(nodes, edges, 0.016, { w: 1000, h: 800, margin: 30 });
}

describe('stepGraph', () => {
  it('drifts a node to its anchor', () => {
    const nodes = new Map([['a', node('a', 100, 100, 500, 400)]]);
    run(nodes);
    expect(nodes.get('a')!.x).toBeCloseTo(500, 0);
    expect(nodes.get('a')!.y).toBeCloseTo(400, 0);
  });

  it('keeps two nodes anchored at the same spot apart', () => {
    const nodes = new Map([
      ['a', node('a', 400, 400)],
      ['b', node('b', 401, 400, 400, 400)],
    ]);
    run(nodes);
    const d = Math.hypot(
      nodes.get('a')!.x - nodes.get('b')!.x,
      nodes.get('a')!.y - nodes.get('b')!.y,
    );
    expect(d).toBeGreaterThan(40);
  });

  it('stays inside the bounds', () => {
    const nodes = new Map([['a', node('a', 500, 400, -500, 5000)]]);
    run(nodes);
    const a = nodes.get('a')!;
    expect(a.x).toBeGreaterThanOrEqual(30);
    expect(a.y).toBeLessThanOrEqual(770);
  });
});
