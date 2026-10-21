import type { AgentView } from './agentViews.js';
import type { SimNode } from './graphSim.js';

/** A meeting's geometry: where its members sit around the lead. Pure. */

/** The free wedge on the lead's right (its label goes there), in radians. */
const LABEL_WEDGE = (80 * Math.PI) / 180;
/** Arc each subagent needs so their name chips do not touch. */
const SUB_ARC_PX = 125;

/** How far a meeting's subagents sit from their lead. */
export function meetingRadius(count: number): number {
  return Math.max(150, (count * SUB_ARC_PX) / (Math.PI * 2 - LABEL_WEDGE));
}

/** Where the j-th of n subagents sits around its lead (0 rad = right). */
export function meetingAngle(j: number, n: number): number {
  const span = Math.PI * 2 - LABEL_WEDGE;
  return LABEL_WEDGE / 2 + (span * (j + 0.5)) / n;
}

/** A meeting's circle around its lead (a double click in its hole focuses
 *  it), world coords. */
export interface MeetingCircle {
  id: number;
  x: number;
  y: number;
  r: number;
}

/** A lead with two members or more and the circle they sit on. */
export function meetingCircles(list: AgentView[], nodes: Map<string, SimNode>): MeetingCircle[] {
  return list.flatMap((v) => {
    const n = v.subagents.length >= 2 ? nodes.get(`a${v.id}`) : undefined;
    return n ? [{ id: v.id, x: n.x, y: n.y, r: meetingRadius(v.subagents.length) }] : [];
  });
}
