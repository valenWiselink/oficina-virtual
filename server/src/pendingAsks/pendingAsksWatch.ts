import { spokenName, teTocaRawLine } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { prStateOf } from '../mergedAsk.js';
import type { AgentState } from '../types.js';
import { openQuestionOf } from './openQuestion.js';
import { commandOf, type PendingAsks, prUrlsOf } from './pendingAsks.js';

const JARVIS_NAME = 'Jarvis';
/** A question he does not answer in this long goes to the list: a live chat
 *  answers sooner, and nothing flickers in and out of Pendientes. */
export const QUESTION_GRACE_MS = 2 * 60_000;
/** Jarvis already left something in this turn (a «Te toca:», dejar_pendiente):
 *  its question is most likely that same thing. */
const SAME_TURN_MS = 5 * 60_000;
const TICK_MS = 30_000;

/** The supervisor of everyone: what it says to Valentín always lands in the list. */
function isJarvis(agent: AgentState): boolean {
  return agent.supervision?.kind === 'all';
}

/** «avisarme cuando…», «decirme si…»: the whole ask is an answer for the agent. */
const ANSWER_FOR_AGENT =
  /^(?:avisarme|decirme|contestarme|responderme|confirmarme|pasarme|mandarme)\b/i;

/**
 * What feeds the list from the agents:
 * - What Jarvis asks, as it comes: whatever brings it to the middle of the screen
 *   (its «Te toca:», or the PR it handed over) stays here once that goes away.
 * - What Jarvis asks without «Te toca:» (a «¿…?» or a «cuando…, avíseme» at
 *   the end of a turn, openQuestion.ts) once he has not answered it for a
 *   couple of minutes; his next words to Jarvis close it.
 * - Another agent's, only when it closes with one left: until then it is on the
 *   board, and it would be shown twice. Closed by Jarvis it comes in too, and
 *   `cerrar_agente` tells Jarvis under which id: the list does not depend on Jarvis
 *   remembering. Only a workspace supervisor's closing stays out (its tool tells it
 *   to pass the ask on, and its team is its own). If it only waited for an
 *   answer itself («avisarme cuando…»), nobody waits any more: it looks done.
 * A newer answer of the same agent replaced the older on its card already.
 * Once every PR an ask names is merged, it looks done too.
 */
export class PendingAsksWatch {
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Sessions whose closing a workspace supervisor answers for. */
  private readonly closedBySupervisor = new Set<string>();

  constructor(
    private readonly store: AgentStateStore,
    private readonly asks: PendingAsks,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    this.store.on('broadcast', this.onBroadcast);
    this.sync();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  /** From here on closing means the office is going down, not an agent leaving. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.store.off('broadcast', this.onBroadcast);
  }

  /** A page connected: anything seen before the office knew who Jarvis is. */
  sync(): void {
    for (const [id, agent] of this.store) this.observe(id, agent);
    this.tick();
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
    const name = spokenName(agent);
    const raw = teTocaRawLine(agent.lastReply);
    this.asks.add({
      from: name,
      text: turn.text,
      at: turn.at,
      turnId: turn.id,
      command: commandOf(raw),
      prUrl: turn.prAsk?.url,
      prUrls: prUrlsOf(raw ?? turn.text, agent.prLinks),
      seemsDone: ANSWER_FOR_AGENT.test(turn.text.trim())
        ? `«${name}» ya se cerró: nadie espera la respuesta`
        : undefined,
    });
  }

  /** Jarvis's question nobody answered, once its grace is over. */
  tick(): void {
    if (this.stopped) return;
    for (const [, agent] of this.store) {
      if (isJarvis(agent)) this.askOpenQuestion(agent);
    }
  }

  private askOpenQuestion(agent: AgentState): void {
    const { lastReply, lastReplyId, lastReplyAt } = agent;
    // Its turn is over: a question in the middle of its work is not one for him.
    if (!lastReply || !lastReplyId || lastReplyAt === undefined || !agent.isWaiting) return;
    if (agent.activeToolIds.size > 0 || this.asks.hasSeen(lastReplyId)) return;
    if ((agent.valentinPromptAt ?? 0) >= lastReplyAt) return;
    if (this.now() - lastReplyAt < QUESTION_GRACE_MS) return;
    if (this.asks.addedSince(JARVIS_NAME, lastReplyAt - SAME_TURN_MS)) return;
    const question = openQuestionOf(lastReply);
    if (!question) return;
    this.asks.add({
      from: JARVIS_NAME,
      text: question,
      at: lastReplyAt,
      turnId: lastReplyId,
      question: true,
      prUrls: prUrlsOf(question, agent.prLinks),
    });
  }

  private readonly onBroadcast = (message: Record<string, unknown>): void => {
    if (message.type === 'prStatus') {
      if (message.state === 'merged' && typeof message.url === 'string') {
        this.asks.closeByPr(message.url, 'Se mergeó el PR');
      }
      this.asks.settlePrs(prStateOf);
    } else if (message.type === 'agentIdentity' && typeof message.id === 'number') {
      const agent = this.store.get(message.id);
      if (agent) this.observe(message.id, agent);
    }
  };

  private observe(_id: number, agent: AgentState): void {
    if (!isJarvis(agent)) return;
    this.asks.closeByPermission(agent.asksValentin, 'Se decidió el permiso');
    if (agent.valentinPromptAt !== undefined) this.asks.closeAnswered(agent.valentinPromptAt);
    const turn = agent.yourTurn;
    if (!turn || turn.merged || this.asks.hasSeen(turn.id)) return;
    const raw = teTocaRawLine(agent.lastReply);
    this.asks.add({
      from: JARVIS_NAME,
      text: turn.text,
      at: turn.at,
      turnId: turn.id,
      command: commandOf(raw),
      prUrl: turn.prAsk?.url,
      prUrls: prUrlsOf(raw ?? turn.text, agent.prLinks),
      permission: agent.asksValentin,
    });
  }
}
