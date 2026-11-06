/**
 * Agents nobody needs any more (asked 2026-11-06: «agentes que ya no son
 * necesarios siguen abiertos»). One that finished its turn, delivered, has
 * nothing left for Valentín and has been quiet a while is marked «para
 * cerrar» on the office, and its supervisors (Jarvis) hear it once, so they
 * close it with cerrar_agente. The office never closes it by itself: a
 * quiet agent may still be the one that deploys after a merge.
 */

import { identityMessage } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { openQuestionOf } from '../pendingAsks/openQuestion.js';
import type { PendingAsks } from '../pendingAsks/pendingAsks.js';
import type { AgentState } from '../types.js';
import { teamState } from './supervisorLaunch.js';

export const QUIET_MS = 15 * 60_000;
const TICK_MS = 60_000;

export interface CloseWatchDeps {
  store: AgentStateStore;
  asks: () => PendingAsks | undefined;
  /** Permissions it is waiting on (the approval cards). */
  permissionsOf: (agent: AgentState) => number;
  /** Tell its supervisors (SupervisorRelay.notify). */
  tell: (id: number, line: (name: string) => string) => void;
  now?: () => number;
}

/** Its «Te toca» needs nothing more: merged, marked «Hecho», or its ask closed. */
export function yourTurnSettled(agent: AgentState, asks: PendingAsks | undefined): boolean {
  const turn = agent.yourTurn;
  if (!turn || turn.merged) return true;
  if (!asks) return false;
  const ask = asks.byTurn(turn.id);
  if (ask) return ask.closedAt !== undefined;
  return asks.hasSeen(turn.id);
}

/** Why it is not one to close yet, or undefined when it is. */
export function keepReason(
  id: number,
  agent: AgentState,
  deps: Omit<CloseWatchDeps, 'tell'>,
  now: number,
): string | undefined {
  if (!agent.officeTerminal) return 'runs outside the office';
  if (agent.supervision) return 'a supervisor';
  if (agent.leadAgentId !== undefined || agent.spawnToolUseId) return 'a teammate';
  if (teamState(id, agent, deps.permissionsOf(agent), deps.store).kind !== 'done') return 'busy';
  if (!yourTurnSettled(agent, deps.asks())) return 'asks you something';
  if (agent.lastReply && openQuestionOf(agent.lastReply)) return 'asks a question';
  const last = agent.lastRecordAt ?? agent.lastDataAt;
  if (!last || now - last < QUIET_MS) return 'not quiet long enough';
  return undefined;
}

export class CloseWatch {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;

  constructor(private readonly deps: CloseWatchDeps) {
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  tick(): void {
    const now = this.now();
    for (const [id, agent] of this.deps.store.entries()) {
      const due = keepReason(id, agent, this.deps, now) === undefined;
      if (due === (agent.closeSuggestedAt !== undefined)) continue;
      if (due) {
        agent.closeSuggestedAt = now;
        const minutes = Math.round((now - (agent.lastRecordAt ?? agent.lastDataAt)) / 60_000);
        this.deps.tell(
          id,
          (name) =>
            `«${name}» terminó, entregó y lleva ${minutes} minutos quieto, sin nada pendiente para Valentín: la oficina lo marca «para cerrar». Si ya no hace falta, cerralo con cerrar_agente; si sigue haciendo falta (espera un merge, un pase), dejalo.`,
        );
      } else {
        delete agent.closeSuggestedAt;
      }
      this.deps.store.broadcast(identityMessage(id, agent));
    }
  }
}
