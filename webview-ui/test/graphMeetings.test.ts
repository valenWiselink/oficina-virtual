import { describe, expect, it } from 'vitest';

import type { AgentView } from '../src/views/agentViews.js';
import { meetingCircles, meetingRadius } from '../src/views/graphMeeting.js';
import type { SimNode } from '../src/views/graphSim.js';

const view = (id: number, members: number): AgentView => ({
  id,
  canSetRun: false,
  supervisorNames: [],
  teamSize: 0,
  supervisedBy: [],
  name: `A${id}`,
  key: `k${id}`,
  palette: 0,
  hueShift: 0,
  kind: 'meet',
  statusText: '',
  subagents: Array.from({ length: members }, (_, i) => ({
    id: -(id * 10 + i),
    label: 'S',
    kind: 'work' as const,
    statusText: '',
  })),
  tasks: [],
  hasTerminal: true,
});
const node = (id: string, x: number, y: number): SimNode => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  r: 40,
  ax: x,
  ay: y,
});

describe('meetingCircles (double click in its hole focuses it)', () => {
  it('a lead with two members or more, on its circle', () => {
    const nodes = new Map([
      ['a1', node('a1', 100, 200)],
      ['a2', node('a2', 500, 200)],
    ]);
    expect(meetingCircles([view(1, 3), view(2, 1)], nodes)).toEqual([
      { id: 1, x: 100, y: 200, r: meetingRadius(3) },
    ]);
  });
});
