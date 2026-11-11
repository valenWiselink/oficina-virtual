import { spokenName, teTocaRawLine } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { prStateOf } from '../mergedAsk.js';
import type { AgentState } from '../types.js';
import { openQuestionOf } from './openQuestion.js';
import { commandOf, HOLD_MS, JARVIS, type PendingAsks } from './pendingAsks.js';

/** A question he does not answer in this long goes to the list: a live chat
 *  answers sooner, and nothing flickers in and out of Pendientes. */
export const QUESTION_GRACE_MS = 2 * 60_000;
/** Jarvis already left something in this turn (a «Te toca:», dejar_pendiente):
 *  its question is most likely that same thing. */
const SAME_TURN_MS = 5 * 60_000;
const TICK_MS = 30_000;
/** With no earlier message of his to go by, «listo» answers what Jarvis asked this lately. */
const RECENT_ASK_MS = 30 * 60_000;

/** The supervisor of everyone: what it says to Valentín always lands in the list. */
function isJarvis(agent: AgentState): boolean {
  return agent.supervision?.kind === 'all';
}

/** «avisarme cuando…», «decirme si…»: the whole ask is an answer for the agent. */
const ANSWER_FOR_AGENT =
  /^(?:avisarme|decirme|contestarme|responderme|confirmarme|pasarme|mandarme)\b/i;

/**
 * The PR numbers any agent linked, with their URL: «#2954» in Jarvis's words
 * is the PR «pase» opened. A number two repos share is left out (ambiguous).
 */
export function knownPrLinks(store: AgentStateStore): Map<number, string> {
  const known = new Map<number, string>();
  const clash = new Set<number>();
  for (const [, agent] of store) {
    for (const [n, url] of agent.prLinks ?? []) {
      if (known.has(n) && known.get(n) !== url) clash.add(n);
      else known.set(n, url);
    }
  }
  for (const n of clash) known.delete(n);
  return known;
}

/**
 * What feeds the list from the agents:
 * - What Jarvis asks, as it comes: whatever brings it to the middle of the screen
 *   (its «Te toca:», or the PR it handed over) stays here once that goes away.
 *   About the same thing as one already there, it joins that one (pendingAsks.ts).
 * - What Jarvis asks without «Te toca:» (a «¿…?» or a «cuando…, avíseme» at
 *   the end of a turn, openQuestion.ts) once he has not answered it for a
 *   couple of minutes; his next words to Jarvis close it.
 * - What he writes to Jarvis: an ask named by its id, or a short «listo» to what
 *   Jarvis just asked, is answered (pendingAsks.answeredBy).
 * - Another agent's, only when it closes with one left: until then it is on the
 *   board. With Jarvis in the office it is held out of sight for a few minutes,
 *   so Jarvis can pass it on in his own words (it joins his) or drop it;
 *   `cerrar_agente` tells Jarvis its id. Only a workspace supervisor's closing
 *   stays out (its tool tells it to pass the ask on). If it only waited for an
 *   answer itself («avisarme cuando…»), nobody waits any more: it looks done.
 * Once every PR an ask names is merged, it is done (or looks done).
 */
export class PendingAsksWatch {
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Sessions whose closing a workspace supervisor answers for. */
  private readonly closedBySupervisor = new Set<string>();
  /** His last message to Jarvis already read, per Jarvis session. */
  private readonly promptSeen = new Map<string, number>();

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
    const jarvisHere = [...this.store.values()].some((a) => a !== agent && isJarvis(a));
    this.asks.add({
      from: name,
      text: turn.text,
      at: turn.at,
      turnId: turn.id,
      command: commandOf(raw),
      prUrl: turn.prAsk?.url,
      knownPrs: knownPrLinks(this.store),
      seemsDone: ANSWER_FOR_AGENT.test(turn.text.trim())
        ? `«${name}» ya se cerró: nadie espera la respuesta`
        : undefined,
      holdMs: jarvisHere ? HOLD_MS : undefined,
    });
  }

  /** Jarvis's question nobody answered, once its grace is over; and the clock. */
  tick(): void {
    if (this.stopped) return;
    for (const [, agent] of this.store) {
      if (isJarvis(agent)) this.askOpenQuestion(agent);
    }
    this.asks.tick();
  }

  private askOpenQuestion(agent: AgentState): void {
    const { lastReply, lastReplyId, lastReplyAt } = agent;
    // Its turn is over: a question in the middle of its work is not one for him.
    if (!lastReply || !lastReplyId || lastReplyAt === undefined || !agent.isWaiting) return;
    if (agent.activeToolIds.size > 0 || this.asks.hasSeen(lastReplyId)) return;
    if ((agent.valentinPromptAt ?? 0) >= lastReplyAt) return;
    if (this.now() - lastReplyAt < QUESTION_GRACE_MS) return;
    if (this.asks.addedSince(JARVIS, lastReplyAt - SAME_TURN_MS)) return;
    const question = openQuestionOf(lastReply);
    if (!question) return;
    this.asks.add({
      from: JARVIS,
      text: question,
      at: lastReplyAt,
      turnId: lastReplyId,
      question: true,
      knownPrs: knownPrLinks(this.store),
    });
  }

  private readonly onBroadcast = (message: Record<string, unknown>): void => {
    if (message.type === 'prStatus') {
      if (message.state === 'merged' && typeof message.url === 'string') {
        this.asks.closeByPr(message.url, 'Se mergeó el PR');
      }
      if (typeof message.url === 'string') this.asks.prChanged(message.url, prStateOf);
    } else if (message.type === 'agentIdentity' && typeof message.id === 'number') {
      const agent = this.store.get(message.id);
      if (agent) this.observe(message.id, agent);
    }
  };

  private observe(_id: number, agent: AgentState): void {
    if (!isJarvis(agent)) return;
    this.asks.closeByPermission(agent.asksValentin, 'Se decidió el permiso');
    this.readAnswer(agent);
    const turn = agent.yourTurn;
    if (!turn || turn.merged || this.asks.hasSeen(turn.id)) return;
    const raw = teTocaRawLine(agent.lastReply);
    // A permission belongs to the one ask that brought it, not to every later «Te toca:».
    const permission =
      agent.asksValentin && !this.asks.pending().some((a) => a.permission === agent.asksValentin)
        ? agent.asksValentin
        : undefined;
    this.asks.add({
      from: JARVIS,
      text: turn.text,
      at: turn.at,
      turnId: turn.id,
      command: commandOf(raw),
      prUrl: turn.prAsk?.url,
      knownPrs: knownPrLinks(this.store),
      permission,
    });
  }

  /** His new words to Jarvis: the questions before them are answered, and
   *  what they name or settle («[p12] listo», «sí») too. */
  private readAnswer(agent: AgentState): void {
    const at = agent.valentinPromptAt;
    if (at === undefined) return;
    this.asks.closeAnswered(at);
    const key = agent.sessionId;
    const before = this.promptSeen.get(key);
    if (before !== undefined && at <= before) return;
    this.promptSeen.set(key, at);
    // The first look after a restart only learns where he was.
    if (before === undefined && this.now() - at > QUESTION_GRACE_MS) return;
    // Without an earlier message, «listo» answers only what Jarvis asked lately.
    const since = before ?? at - RECENT_ASK_MS;
    if (agent.valentinPromptText) this.asks.answeredBy(agent.valentinPromptText, at, since);
  }
}
