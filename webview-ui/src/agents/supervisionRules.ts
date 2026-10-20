import { inWorkspace, type Placeable, type WorkspaceState } from '../workspaces/workspaceRules.js';

/**
 * Supervisors: which agents a supervisor looks after. A workspace's team is
 * worked out here (workspaces live in the browser) and sent to the office;
 * "elegidos" is the list picked in the dialog; "todos" the office works out.
 * Pure, so it is tested without a DOM.
 */
export type SupervisionScope =
  | { kind: 'none' }
  | { kind: 'workspace'; workspaceId: string; name: string }
  | { kind: 'agents' }
  | { kind: 'all' };

export interface TeamCandidate extends Placeable {
  id: number;
  /** Its session id when known (what the office keys teams by). */
  key: string;
  supervision?: { kind: string };
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** It supervises others (a supervisor is never on anyone's team). */
export const isSupervisor = (a: { supervision?: { kind: string } }): boolean =>
  !!a.supervision && a.supervision.kind !== 'none';

/** Who can be on a team: agents with a session, not supervisors, not itself. */
export function teamCandidates<T extends TeamCandidate>(
  agents: readonly T[],
  supervisorId: number,
): T[] {
  return agents.filter((a) => a.id !== supervisorId && !isSupervisor(a) && SESSION_ID.test(a.key));
}

/** The session ids of a workspace's team, sorted (so changes compare easily). */
export function workspaceTeam<T extends TeamCandidate>(
  agents: readonly T[],
  supervisorId: number,
  state: WorkspaceState,
  workspaceId: string,
): string[] {
  return inWorkspace(teamCandidates(agents, supervisorId), state, workspaceId)
    .map((a) => a.key)
    .sort();
}

/** Same members, in any order. */
export function sameTeam(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}
