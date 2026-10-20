import { transport } from '../transport/index.js';

/**
 * Agents with a turn in progress, known from evidence only: a turn starts
 * with a status 'active' or any tool event, and ends with status 'waiting'
 * (or the agent closing). Characters are created "active" by default, so
 * without this a session that never got a message — just launched, resumed,
 * or adopted while idle — read "Pensando…" forever.
 */
const inTurn = new Set<number>();

transport.onMessage((msg) => {
  switch (msg.type) {
    case 'agentStatus':
      if (msg.status === 'active') inTurn.add(msg.id);
      else inTurn.delete(msg.id);
      break;
    case 'agentToolStart':
    case 'agentToolDone':
    case 'subagentToolStart':
      inTurn.add(msg.id);
      break;
    case 'agentClosed':
      inTurn.delete(msg.id);
      break;
  }
});

export function hasTurnInProgress(id: number): boolean {
  return inTurn.has(id);
}
