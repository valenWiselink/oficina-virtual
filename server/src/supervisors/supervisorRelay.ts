/**
 * What reaches a supervisor without it asking: a permission one of its agents
 * is waiting for, a question with options, and the end of a turn (with what
 * the agent said). The office writes it into the supervisor's own terminal as
 * a message that starts with "[Oficina]"; whatever lands within a few seconds
 * goes in one message, so a busy team does not flood it.
 */

import { spokenName } from '../agentIdentity.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { sendToTerminal } from '../terminal/handOff.js';
import type { SupervisorRegistry } from './supervision.js';

/** Longest piece of an answer forwarded; the supervisor can ask for the rest. */
export const REPLY_CLIP = 1200;
const BATCH_MS = 3000;
/** The transcript lags the end of a turn a little: read the answer after this. */
const SETTLE_MS = 1500;
/** A question already told from its hook is not told again from the transcript. */
const QUESTION_DEDUPE_MS = 30_000;

export interface RelayDeps {
  store: AgentStateStore;
  registry: SupervisorRegistry;
  /** The office terminal of an agent, if it has one. */
  terminalOf: (id: number) => { write(data: string): void } | undefined;
  schedule?: (fn: () => void, ms: number) => void;
  now?: () => number;
  batchMs?: number;
  settleMs?: number;
}

export function clip(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max
    ? `${clean.slice(0, max)}… [sigue: pedila con ultima_respuesta]`
    : clean;
}

/** One line for what a permission asks ("Bash `npm test`", "Edit src/a.ts"). */
export function describeRequest(toolName: string, input: Record<string, unknown>): string {
  const command = typeof input.command === 'string' ? input.command.split('\n')[0] : undefined;
  if (command) return `${toolName} \`${clip(command, 200)}\``;
  const file = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof file === 'string') return `${toolName} ${file}`;
  if (typeof input.url === 'string') return `${toolName} ${input.url}`;
  const json = JSON.stringify(input);
  return json && json !== '{}' ? `${toolName} ${clip(json, 200)}` : toolName;
}

/** An AskUserQuestion's questions and options, as lines. */
export function describeQuestions(input: Record<string, unknown>): string | undefined {
  if (!Array.isArray(input.questions)) return undefined;
  const lines: string[] = [];
  for (const q of input.questions as Array<Record<string, unknown>>) {
    if (typeof q?.question !== 'string') continue;
    const options = Array.isArray(q.options)
      ? (q.options as Array<Record<string, unknown>>)
          .map((o, i) => `${i + 1}. ${String(o?.label ?? '')}`)
          .join(' · ')
      : '';
    lines.push(options ? `${q.question} (${options})` : q.question);
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** The message a supervisor gets for a batch of news. */
export function relayText(lines: string[]): string {
  if (lines.length === 1) return `[Oficina] ${lines[0]}`;
  return `[Oficina] Novedades de tu equipo:\n\n${lines.map((l) => `- ${l}`).join('\n\n')}`;
}

export class SupervisorRelay {
  private readonly pending = new Map<number, string[]>();
  private readonly waiting = new Map<number, boolean>();
  private readonly questionToldAt = new Map<number, number>();
  /** The answer each agent's last "terminó su turno" carried. */
  private readonly replyTold = new Map<number, string>();
  private readonly schedule: (fn: () => void, ms: number) => void;
  private readonly now: () => number;

  constructor(private readonly deps: RelayDeps) {
    this.schedule = deps.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
    this.now = deps.now ?? Date.now;
  }

  /** Feed every office broadcast. */
  observe(message: Record<string, unknown>): void {
    const id = typeof message.id === 'number' ? message.id : undefined;
    if (id === undefined) return;
    switch (message.type) {
      case 'permissionPending': {
        const input = (message.toolInput as Record<string, unknown> | undefined) ?? {};
        this.tell(
          id,
          (name) =>
            `«${name}» pide permiso ${String(message.requestId)} para: ${describeRequest(String(message.toolName ?? ''), input)}`,
        );
        return;
      }
      case 'agentStatus': {
        const waiting = message.status === 'waiting';
        const before = this.waiting.get(id);
        this.waiting.set(id, waiting);
        // The first status seen (a restart) is the state, not an event —
        // except for an agent a supervisor just launched, whose first turn
        // may end before the office saw it start (lanzar_agente).
        const launched = before === undefined && this.justLaunched(id);
        if (waiting && (before === false || launched)) {
          this.schedule(() => this.turnEnded(id), this.deps.settleMs ?? SETTLE_MS);
        }
        return;
      }
      case 'agentToolStart':
        if (message.toolName !== 'AskUserQuestion') return;
        if (this.now() - (this.questionToldAt.get(id) ?? -Infinity) < QUESTION_DEDUPE_MS) return;
        this.questionToldAt.set(id, this.now());
        this.tell(
          id,
          (name) =>
            `«${name}» hace una pregunta con opciones y espera respuesta (está en su terminal; mirala con ultima_respuesta si hace falta).`,
        );
        return;
      case 'agentClosed':
        this.waiting.delete(id);
        this.questionToldAt.delete(id);
        this.replyTold.delete(id);
        return;
      default:
        return;
    }
  }

  /** Feed every hook event: a question's text and options come from here. */
  observeHook(event: Record<string, unknown>): void {
    const name = event.hook_event_name;
    if (name !== 'PreToolUse' && name !== 'PermissionRequest') return;
    if (event.tool_name !== 'AskUserQuestion') return;
    const sessionId = typeof event.session_id === 'string' ? event.session_id : '';
    const id = this.agentIdFor(sessionId);
    if (id === undefined) return;
    if (this.now() - (this.questionToldAt.get(id) ?? -Infinity) < QUESTION_DEDUPE_MS) return;
    const input = (event.tool_input as Record<string, unknown> | undefined) ?? {};
    const questions = describeQuestions(input);
    this.questionToldAt.set(id, this.now());
    this.tell(id, (who) =>
      questions
        ? `«${who}» pregunta y espera respuesta:\n${questions}`
        : `«${who}» hace una pregunta con opciones y espera respuesta.`,
    );
  }

  private justLaunched(id: number): boolean {
    const agent = this.deps.store.get(id);
    return agent ? this.deps.registry.takeFirstTurn(agent.sessionId) : false;
  }

  private agentIdFor(sessionId: string): number | undefined {
    if (!sessionId) return undefined;
    for (const [id, agent] of this.deps.store.entries()) {
      if (agent.sessionId === sessionId && agent.leadAgentId === undefined) return id;
    }
    return undefined;
  }

  private turnEnded(id: number): void {
    const agent = this.deps.store.get(id);
    // Still waiting (not a blip between two tools), and it said something.
    if (!agent || this.waiting.get(id) !== true) return;
    const reply = agent.lastReply?.trim();
    // Same answer as the last notice: a blip (a background task woke it and
    // it went back to waiting), not a new turn — the supervisor got four in
    // a row, 2026-10-20.
    if (reply && this.replyTold.get(id) === reply) return;
    if (reply) this.replyTold.set(id, reply);
    this.tell(id, (name) =>
      reply
        ? `«${name}» terminó su turno. Lo último que dijo:\n${clip(reply, REPLY_CLIP)}`
        : `«${name}» terminó su turno.`,
    );
  }

  /** Queue a line for every supervisor of agent `id`. */
  private tell(id: number, line: (name: string) => string): void {
    const agent = this.deps.store.get(id);
    if (!agent) return;
    const name = spokenName(agent);
    for (const supervisorId of this.deps.registry.supervisorsOf(agent.sessionId)) {
      const lines = this.pending.get(supervisorId);
      if (lines) {
        lines.push(line(name));
        continue;
      }
      this.pending.set(supervisorId, [line(name)]);
      this.schedule(() => this.flush(supervisorId), this.deps.batchMs ?? BATCH_MS);
    }
  }

  private flush(supervisorId: number): void {
    const lines = this.pending.get(supervisorId);
    this.pending.delete(supervisorId);
    const terminal = this.deps.terminalOf(supervisorId);
    if (!lines || lines.length === 0 || !terminal) return;
    sendToTerminal(terminal, relayText(lines));
  }
}
