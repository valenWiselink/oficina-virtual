import { TRANSPORT_STATE_CONNECTED } from '../../../core/src/constants.js';
import { transport } from '../transport/index.js';

/**
 * Agents asking a permission, and since when (server clock), straight from
 * the messages — not from the character's bubble, which a message arriving
 * before the character exists (the replay on connect, an office restart)
 * cannot set. It is what keeps an agent in "Te necesita" once the office no
 * longer holds the request and only the terminal asks it, and what "te espera
 * hace N min" counts then (the card and its createdAt are gone). The ask ends
 * the way the bubble does: cleared, a new call started, the turn ended.
 */
const asking = new Map<number, number | undefined>();

transport.onMessage((msg) => {
  switch (msg.type) {
    case 'agentToolPermission':
      asking.set(msg.id, msg.since ?? asking.get(msg.id));
      break;
    case 'agentToolStart':
      // A call that is not the one asking: the ask was answered.
      if (!msg.permissionActive) asking.delete(msg.id);
      break;
    case 'agentStatus':
      if (msg.status === 'waiting') asking.delete(msg.id);
      break;
    case 'agentToolPermissionClear':
    case 'agentToolsClear':
    case 'agentClosed':
      asking.delete(msg.id);
      break;
  }
});

transport.onStateChange((state) => {
  // The replay after webviewReady sends what still stands.
  if (state !== TRANSPORT_STATE_CONNECTED) asking.clear();
});

export function isAskingPermission(id: number): boolean {
  return asking.has(id);
}

export function permissionSince(id: number): number | undefined {
  return asking.get(id);
}
