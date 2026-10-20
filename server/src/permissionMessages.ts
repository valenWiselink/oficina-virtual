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
 */
export function resolvedPermissionMessages(
  request: PendingPermission,
  outcome: PermissionOutcome,
  store: AgentStateStore,
  stillPending: PendingPermission[],
): Record<string, unknown>[] {
  const id = agentIdForSession(request.sessionId, store);
  const messages: Record<string, unknown>[] = [
    { type: 'permissionResolved', requestId: request.requestId, id, outcome },
  ];
  const sameSessionWaiting = stillPending.some((r) => r.sessionId === request.sessionId);
  const agent = id === undefined ? undefined : store.get(id);
  if (agent && !sameSessionWaiting) {
    agent.permissionSent = false;
    messages.push({ type: 'agentToolPermissionClear', id });
  }
  return messages;
}
