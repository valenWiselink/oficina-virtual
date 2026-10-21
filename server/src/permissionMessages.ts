import type { AgentStateStore } from './agentStateStore.js';
import type { PendingPermission, PermissionOutcome } from './permissionBroker.js';

/** The office agent whose session asked, or undefined when the session is not
 *  (yet) on the floor — the card still shows, labelled by its directory. */
function agentIdForSession(sessionId: string, store: AgentStateStore): number | undefined {
  for (const [id, agent] of store.entries()) {
    if (agent.sessionId === sessionId && agent.leadAgentId === undefined) return id;
  }
  return undefined;
}

/** `permissionPending`: an approval card the office can answer. */
export function pendingPermissionMessage(
  request: PendingPermission,
  store: AgentStateStore,
): Record<string, unknown> {
  return {
    type: 'permissionPending',
    requestId: request.requestId,
    id: agentIdForSession(request.sessionId, store),
    toolName: request.toolName,
    toolInput: request.toolInput,
    cwd: request.cwd,
    createdAt: request.createdAt,
  };
}

/**
 * Everything to broadcast when a request ends, whoever answered: the card goes
 * away, and so does the character's "Needs approval" bubble — unless the same
 * session still has another request waiting. Without the clear, the bubble
 * stayed up until the turn ended (measured ~10 s after an office approval).
 *
 * An expired hold (or the office shutting down) answers nothing: the terminal
 * still asks, so only the card goes. The agent stays in "Te necesita" as
 * asking in the terminal until settledPermissionMessages — clearing it here
 * showed it "Trabajando" while it sat waiting (a 503 s wait, 2026-10-20).
 */
export function resolvedPermissionMessages(
  request: PendingPermission,
  outcome: PermissionOutcome,
  store: AgentStateStore,
  stillAsked: PendingPermission[],
): Record<string, unknown>[] {
  const id = agentIdForSession(request.sessionId, store);
  const messages: Record<string, unknown>[] = [
    { type: 'permissionResolved', requestId: request.requestId, id, outcome },
  ];
  if (outcome === 'expired') return messages;
  return messages.concat(settledPermissionMessages(request, store, stillAsked));
}

/** The bubble goes once a request is over — answered, or settled in the
 *  terminal (the tool ran, the turn or the session ended) — unless the
 *  session still asks something else (`stillAsked`: held or in the terminal). */
export function settledPermissionMessages(
  request: PendingPermission,
  store: AgentStateStore,
  stillAsked: PendingPermission[],
): Record<string, unknown>[] {
  const id = agentIdForSession(request.sessionId, store);
  const sameSessionWaiting = stillAsked.some((r) => r.sessionId === request.sessionId);
  const agent = id === undefined ? undefined : store.get(id);
  if (!agent || sameSessionWaiting) return [];
  agent.permissionSent = false;
  agent.permissionSince = undefined;
  return [{ type: 'agentToolPermissionClear', id }];
}
