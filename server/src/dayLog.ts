/**
 * DayLog: today's history of the office, one line per thing that happened to
 * an agent — a permission asked or answered, a turn finished, something left
 * for you ("te toca"), a task completed, a session closed, a context nearly
 * full. Built from the messages the server already broadcasts (so it says
 * only what the office itself saw), kept in memory for the day and appended
 * to ~/.pixel-agents/historial-AAAA-MM-DD.jsonl so a reload or a restart does
 * not lose it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { DayLogEntry } from '../../core/src/messages.js';
import { spokenName } from './agentIdentity.js';
import type { AgentStateStore } from './agentStateStore.js';

/** A context this full gets one line (the first time it crosses). */
const CONTEXT_ALERT_RATIO = 0.9;

interface AgentMemory {
  /** Its identity was seen once: from then on, changes are news. */
  known?: boolean;
  /** Background work still running (its turn ending is not "finished"). */
  background?: number;
  name?: string;
  waiting?: boolean;
  yourTurnId?: string;
  completed: Set<string>;
  contextAlerted?: boolean;
}

const OUTCOME_TEXT: Record<string, string> = {
  allow: 'Aprobaste su permiso',
  deny: 'Rechazaste su permiso',
  terminal: 'Su permiso se contestó en la terminal',
  expired: 'Su pedido de permiso venció',
};

export class DayLog {
  private entries: DayLogEntry[] = [];
  private day: string;
  private readonly agents = new Map<number, AgentMemory>();
  /** requestId → when it was asked and by whom (to measure the wait). */
  private readonly asked = new Map<string, { at: number; agentId?: number }>();

  constructor(
    private readonly store: AgentStateStore,
    private readonly dir = path.join(os.homedir(), '.pixel-agents'),
    private readonly now: () => number = Date.now,
  ) {
    this.day = localDay(this.now());
    this.entries = this.load(this.day);
  }

  start(): void {
    this.store.on('broadcast', (message: Record<string, unknown>) => this.observe(message));
  }

  /** Today's lines, oldest first. */
  today(): DayLogEntry[] {
    this.rollOver();
    return [...this.entries];
  }

  /** The PR links in today's history (for the merge watch). */
  prUrls(): string[] {
    this.rollOver();
    return this.entries.flatMap((e) => (e.prUrl ? [e.prUrl] : []));
  }

  /** A PR an agent left you got merged: credited to whoever posted it today. */
  prMerged(url: string, title?: string): void {
    const posted = [...this.entries]
      .reverse()
      .find((e) => e.prUrl === url && e.kind !== 'mergeado');
    this.add(posted?.agentId, 'mergeado', `Se mergeó: ${title ?? url}`, {
      prUrl: url,
      agent: posted?.agent,
    });
  }

  /** Turn one broadcast into history lines (most messages say nothing new). */
  observe(message: Record<string, unknown>): void {
    const id = typeof message.id === 'number' ? message.id : undefined;
    switch (message.type) {
      case 'permissionPending':
        this.asked.set(String(message.requestId), { at: this.now(), agentId: id });
        return this.add(
          id,
          'permiso',
          `Pidió permiso (${String(message.toolName ?? 'herramienta')})`,
        );
      case 'permissionResolved':
        return this.resolved(message, id);
      case 'agentStatus':
        return this.status(id, message.status === 'waiting');
      case 'agentIdentity':
        return this.identity(id!, message);
      case 'agentContextUsage':
        return this.context(id!, message);
      case 'agentClosed':
        this.add(id, 'cerrado', 'Se cerró');
        this.agents.delete(id!);
        return;
      default:
        return;
    }
  }

  private resolved(message: Record<string, unknown>, id: number | undefined): void {
    const requestId = String(message.requestId);
    const asked = this.asked.get(requestId);
    this.asked.delete(requestId);
    const text = OUTCOME_TEXT[String(message.outcome)] ?? 'Su permiso se resolvió';
    const waitedMs = asked ? this.now() - asked.at : undefined;
    this.add(id ?? asked?.agentId, 'respuesta', text, { waitedMs });
  }

  private status(id: number | undefined, waiting: boolean): void {
    if (id === undefined) return;
    const mem = this.memory(id);
    // The first status seen (a restart) is the state, not an event.
    if (waiting && mem.waiting === false && !mem.background) {
      this.add(id, 'termino', 'Terminó su turno');
    }
    mem.waiting = waiting;
  }

  private identity(id: number, message: Record<string, unknown>): void {
    const mem = this.memory(id);
    mem.background = Number(message.backgroundTasks ?? 0);
    const name = (message.nickname ?? message.title) as string | undefined;
    if (name) mem.name = name;
    const turnId = message.yourTurnId as string | undefined;
    const tasks = Array.isArray(message.tasks)
      ? (message.tasks as Array<{ id: string; subject: string; status: string }>)
      : [];
    if (!mem.known) {
      // First sight (a restart, a resumed session): what is already there
      // happened before — remember it without writing it as news.
      mem.known = true;
      mem.yourTurnId = turnId;
      for (const t of tasks) if (t.status === 'completed') mem.completed.add(t.id);
      return;
    }
    const turnText = `Te toca: ${String(message.yourTurn)}`;
    // A restart can first see the session before its transcript is read, so
    // the old "te toca" looks new; today's history already has it.
    if (turnId && turnId !== mem.yourTurnId && !this.alreadyLogged(id, turnText)) {
      this.add(id, 'tetoca', turnText, {
        prUrl: message.yourTurnUrl as string | undefined,
      });
    }
    mem.yourTurnId = turnId;
    for (const task of tasks) {
      if (task.status !== 'completed' || mem.completed.has(task.id)) continue;
      mem.completed.add(task.id);
      this.add(id, 'tarea', `Completó: ${task.subject}`);
    }
  }

  private context(id: number, message: Record<string, unknown>): void {
    const used = Number(message.contextTokens);
    const max = Number(message.maxContextTokens);
    if (!(max > 0)) return;
    const mem = this.memory(id);
    const full = used / max >= CONTEXT_ALERT_RATIO;
    if (full && !mem.contextAlerted) {
      this.add(id, 'contexto', `Contexto al ${Math.round((used / max) * 100)}%`);
    }
    mem.contextAlerted = full;
  }

  private alreadyLogged(id: number, text: string): boolean {
    const agent = this.nameOf(id);
    return this.entries.some((e) => e.text === text && e.agent === agent);
  }

  private memory(id: number): AgentMemory {
    let mem = this.agents.get(id);
    if (!mem) {
      mem = { completed: new Set() };
      this.agents.set(id, mem);
    }
    return mem;
  }

  /** The last segment of where the agent works (its session's cwd, else the
   *  Directory it was launched in), for telling the day by project. */
  private folderOf(id: number | undefined): string | undefined {
    const agent = id === undefined ? undefined : this.store.get(id);
    if (agent?.cwd) return path.basename(agent.cwd) || undefined;
    return agent?.directoryName;
  }

  private nameOf(id: number | undefined): string {
    if (id === undefined) return 'Un agente';
    const agent = this.store.get(id);
    return this.agents.get(id)?.name ?? (agent ? spokenName(agent) : `Agente ${id}`);
  }

  private add(
    agentId: number | undefined,
    kind: DayLogEntry['kind'],
    text: string,
    extra: Partial<DayLogEntry> = {},
  ): void {
    this.rollOver();
    const agent = extra.agent ?? this.nameOf(agentId);
    const entry: DayLogEntry = { at: this.now(), agentId, agent, kind, text };
    if (extra.waitedMs !== undefined) entry.waitedMs = extra.waitedMs;
    if (extra.prUrl) entry.prUrl = extra.prUrl;
    const folder = this.folderOf(agentId);
    if (folder) entry.folder = folder;
    this.entries.push(entry);
    this.persist(entry);
    this.store.broadcast({ type: 'dayLogAppended', entry });
  }

  /** A new day starts a new history (yesterday's stays in its file). */
  private rollOver(): void {
    const day = localDay(this.now());
    if (day === this.day) return;
    this.day = day;
    this.entries = this.load(day);
  }

  private file(day: string): string {
    return path.join(this.dir, `historial-${day}.jsonl`);
  }

  private load(day: string): DayLogEntry[] {
    try {
      return fs
        .readFileSync(this.file(day), 'utf-8')
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as DayLogEntry];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  private persist(entry: DayLogEntry): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(this.file(this.day), `${JSON.stringify(entry)}\n`);
    } catch (err) {
      // The history must never break the office; it still lives in memory.
      console.warn(`[Pixel Agents] Could not write the day log: ${String(err)}`);
    }
  }
}

/** AAAA-MM-DD in local time (the operator's day, not UTC's). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
