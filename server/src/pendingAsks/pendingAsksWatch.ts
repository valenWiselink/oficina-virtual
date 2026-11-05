import { spokenName, teTocaRawLine } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import type { AgentState } from '../types.js';
import { commandOf, type PendingAsks } from './pendingAsks.js';

const JARVIS_NAME = 'Jarvis';

/** The supervisor of everyone: what it says to Valentín always lands in the list. */
function isJarvis(agent: AgentState): boolean {
  return agent.supervision?.kind === 'all';
}

/**
 * What feeds the list from the agents:
 * - What Jarvis asks, as it comes: whatever brings it to the middle of the screen
 *   (its «Te toca:», or the PR it handed over) stays here once that goes away.
 * - Another agent's, only when it closes with one left: until then it is on the
 *   board, and it would be shown twice. Closed by Jarvis it comes in too, and
 *   `cerrar_agente` tells Jarvis under which id: the list does not depend on Jarvis
 *   remembering. Only a workspace supervisor's closing stays out (its tool tells it
 *   to pass the ask on, and its team is its own).
 * A newer answer of the same agent replaced the older on its card already.
 */
export class PendingAsksWatch {
  private stopped = false;
  /** Sessions whose closing a workspace supervisor answers for. */
  private readonly closedBySupervisor = new Set<string>();

  constructor(
    private readonly store: AgentStateStore,
    private readonly asks: PendingAsks,
  ) {}

  start(): void {
    this.store.on('broadcast', this.onBroadcast);
    this.sync();
  }

  /** From here on closing means the office is going down, not an agent leaving. */
  stop(): void {
    this.stopped = true;
    this.store.off('broadcast', this.onBroadcast);
  }

  /** A page connected: anything seen before the office knew who Jarvis is. */
  sync(): void {
    for (const [id, agent] of this.store) this.observe(id, agent);
  }

  /** Call right before a workspace supervisor closes an agent it was told about. */
  supervisorCloses(sessionId: string): void {
    this.closedBySupervisor.add(sessionId);
  }

  /** The agent closes (the ✕, Jarvis, or its own session ending). */
  agentClosed(agent: AgentState): void {
    const bySupervisor = this.closedBySupervisor.delete(agent.sessionId);
    const turn = agent.yourTurn;
    if (this.stopped || bySupervisor || isJarvis(agent) || agent.leadAgentId !== undefined) return;
    if (!turn || turn.merged || this.asks.hasSeen(turn.id)) return;
    this.asks.add({
      from: spokenName(agent),
      text: turn.text,
      at: turn.at,
      turnId: turn.id,
      command: commandOf(teTocaRawLine(agent.lastReply)),
      prUrl: turn.prAsk?.url,
    });
  }

  private readonly onBroadcast = (message: Record<string, unknown>): void => {
    if (message.type === 'prStatus') {
      if (message.state === 'merged' && typeof message.url === 'string') {
        this.asks.closeByPr(message.url, 'Se mergeó el PR');
      }
    } else if (message.type === 'agentIdentity' && typeof message.id === 'number') {
      const agent = this.store.get(message.id);
      if (agent) this.observe(message.id, agent);
    }
  };

  private observe(_id: number, agent: AgentState): void {
    if (!isJarvis(agent)) return;
    this.asks.closeByPermission(agent.asksValentin, 'Se decidió el permiso');
    const turn = agent.yourTurn;
    if (!turn || turn.merged || this.asks.hasSeen(turn.id)) return;
    this.asks.add({
      from: JARVIS_NAME,
      text: turn.text,
      at: turn.at,
      turnId: turn.id,
      command: commandOf(teTocaRawLine(agent.lastReply)),
      prUrl: turn.prAsk?.url,
      permission: agent.asksValentin,
    });
  }
}
