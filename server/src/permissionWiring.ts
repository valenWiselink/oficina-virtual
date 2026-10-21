import type { AgentStateStore } from './agentStateStore.js';
import { PermissionBroker } from './permissionBroker.js';
import {
  pendingPermissionMessage,
  resolvedPermissionMessages,
  settledPermissionMessages,
} from './permissionMessages.js';
import { TerminalAsks } from './terminalAsks.js';

/**
 * Approval cards: PermissionRequest hooks wait in the broker for a decision
 * from the office while the terminal prompt stays answerable in parallel.
 * What the terminal still asks is saved (TerminalAsks) so an office restart
 * does not forget it.
 */
export function createPermissionBroker(store: AgentStateStore): {
  broker: PermissionBroker;
  asks: TerminalAsks;
} {
  // Assigned below; the callbacks only run once it exists.
  let broker: PermissionBroker;
  const asks = new TerminalAsks(store, () => broker);
  // Held, or only asked in the terminal: either keeps the bubble up.
  const stillAsked = () => [...broker.pending(), ...broker.askedInTerminal()];
  const broadcastAll = (messages: Record<string, unknown>[]) => {
    for (const message of messages) store.broadcast(message);
  };
  broker = new PermissionBroker({
    onPending: (request) => {
      store.broadcast(pendingPermissionMessage(request, store));
      asks.save();
    },
    // Runs after the request left the broker, so stillAsked() is what remains.
    onResolved: (request, outcome) => {
      broadcastAll(resolvedPermissionMessages(request, outcome, store, stillAsked()));
      asks.save();
    },
    onSettled: (request) => {
      broadcastAll(settledPermissionMessages(request, store, stillAsked()));
      asks.save();
    },
  });
  asks.start();
  return { broker, asks };
}
