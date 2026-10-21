import type { AgentView } from './agentViews.js';

/**
 * The library, where research happens. Researching subagents and meeting
 * members walk in: they leave their seat around their lead (a dashed line
 * still ties them to it) and sit inside, so the library is never an empty
 * circle while someone researches (2026-10-21: it opened and nobody went).
 * A researching agent's own bubble is too big to fit: it leans toward the
 * library and a dashed line reaches it.
 */

export interface LibraryVisitor {
  leadId: number;
  subId: number;
}

/** Centre of the library when it is empty or holds one visitor. */
const HOME = { x: 110, yFromBottom: 110 };
/** Smallest library, as it always was. */
const MIN_R = 52;
/** Between two visitors' centres: two subagent discs (22) plus the label
 *  room the layout keeps between nodes (34), so they never push apart. */
const SEAT_GAP = 80;
/** A visitor's disc and a margin to the library's edge. */
const SEAT_ROOM = 22 + 18;

/** Who walks into the library now, in a stable order. */
export function libraryVisitors(list: AgentView[]): LibraryVisitor[] {
  return list.flatMap((v) =>
    v.subagents.filter((s) => s.kind === 'research').map((s) => ({ leadId: v.id, subId: s.id })),
  );
}

/** The library shows while anyone researches. */
export function libraryOpen(list: AgentView[]): boolean {
  return list.some((v) => v.kind === 'research') || libraryVisitors(list).length > 0;
}

function seatRing(n: number): number {
  return n <= 1 ? 0 : SEAT_GAP / (2 * Math.sin(Math.PI / n));
}

/** Room for everyone inside. */
export function libraryRadius(visitors: number): number {
  return Math.max(MIN_R, seatRing(visitors) + SEAT_ROOM);
}

/** Where the library sits: its corner, moved in as it grows so it never
 *  leaves the world. */
export function libraryCenter(visitors: number, worldH: number): { x: number; y: number } {
  const r = libraryRadius(visitors);
  return { x: Math.max(HOME.x, r + 24), y: Math.min(worldH - HOME.yFromBottom, worldH - r - 24) };
}

/** Where the i-th of n visitors sits, from the library's centre: alone in the
 *  middle, else evenly around a ring. */
export function librarySeat(i: number, n: number): { dx: number; dy: number } {
  if (n <= 1) return { dx: 0, dy: 0 };
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  const ring = seatRing(n);
  return { dx: Math.cos(a) * ring, dy: Math.sin(a) * ring };
}

/** Where a lead's subagent goes: its library seat while it researches, or
 *  null to keep its seat in the meeting around the lead. */
export function librarySpot(
  visitors: LibraryVisitor[],
  leadId: number,
  subId: number,
  worldH: number,
): { x: number; y: number } | null {
  const i = visitors.findIndex((v) => v.leadId === leadId && v.subId === subId);
  if (i < 0) return null;
  const center = libraryCenter(visitors.length, worldH);
  const seat = librarySeat(i, visitors.length);
  return { x: center.x + seat.dx, y: center.y + seat.dy };
}

/** A meeting's pull on a member, let go while it is at the library. */
export function keepsMeetingEdge(kind: string): boolean {
  return kind !== 'research';
}
