/**
 * The client side of supervision: the team the browser computed for a
 * supervisor (its workspace's agents, or the ones picked by hand), and telling
 * every office who supervises whom when that changes.
 */

import { identityMessage } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { type SupervisorRegistry, supervisors } from './supervision.js';

/** Every agent's identity again: "supervisedBy" may have changed for any of them. */
export function broadcastSupervision(store: AgentStateStore): void {
  for (const [id, agent] of store.entries()) {
    if (agent.leadAgentId === undefined) store.broadcast(identityMessage(id, agent));
  }
}

/**
 * `supervisionTeam`: the members (session ids) of a "workspace" or "agents"
 * supervisor. Ignored for anyone else ("all" is computed by the office).
 * Returns true when the team changed.
 */
export function applySupervisionTeam(
  store: AgentStateStore,
  msg: Record<string, unknown>,
  registry: SupervisorRegistry = supervisors(),
): boolean {
  const supervisor = store.get(Number(msg.supervisorId));
  const scope = supervisor?.supervision;
  if (!supervisor || !scope || scope.kind === 'all' || !Array.isArray(msg.members)) return false;
  const members = msg.members.filter((m): m is string => typeof m === 'string').slice(0, 200);
  if (!registry.teams.set(supervisor.sessionId, members)) return false;
  broadcastSupervision(store);
  return true;
}
