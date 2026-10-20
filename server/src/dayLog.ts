/**
 * DayLog: today's history of the office, one line per thing that happened to
 * an agent — a permission asked or answered, a turn finished (with what it
 * did: the start of its answer and how many files it edited), something left
 * for you ("te toca"), a task completed, a session closed, a context nearly
 * full, and the recaps Claude Code writes (what a session achieved). Built
 * from the messages the server already broadcasts (so it says only what the
 * office itself saw) plus today's transcripts for the recaps, kept in memory
 * for the day and appended
 * to ~/.pixel-agents/historial-AAAA-MM-DD.jsonl so a reload or a restart does
 * not lose it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { DayLogEntry } from '../../core/src/messages.js';
import { spokenName } from './agentIdentity.js';
import type { AgentStateStore } from './agentStateStore.js';
import { readRecaps, transcriptsOfDay } from './dayRecaps.js';
import { turnSummary } from './turnSummary.js';

/** A context this full gets one line (the first time it crosses). */
const CONTEXT_ALERT_RATIO = 0.9;
/** A finished turn waits this long for its last answer: the Stop hook is
 *  instant, the transcript line with the answer arrives a beat later. */
const TURN_SETTLE_MS = 3000;
/** Chat lines of a tool that changed a file (agentChat.ts toolLine). */
const EDIT_LINE = /^(Editó|Escribió) /;

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
  /** The newest thing it said this turn (its answer, once the turn ends). */
  lastSaid?: string;
  /** Files it edited or wrote this turn. */
  edits: number;
  /** A finished turn waiting for its answer to arrive. */
  settling?: { at: number; timer?: ReturnType<typeof setTimeout> };
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
  /** Where today's transcripts are read for recaps (none until told). */
  private projectsDir: string | null = null;
  /** transcript → its size when last read for recaps (unchanged: skipped). */
  private readonly recapsRead = new Map<string, number>();

  constructor(
    private readonly store: AgentStateStore,
    private readonly dir = path.join(os.homedir(), '.pixel-agents'),
    private readonly now: () => number = Date.now,
    private readonly settleMs = TURN_SETTLE_MS,
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
    this.catchUpRecaps();
    return [...this.entries].sort((a, b) => a.at - b.at);
  }

  /** Where today's files live (the history and its written summary). */
  storage(): { dir: string; day: string } {
    this.rollOver();
    return { dir: this.dir, day: this.day };
  }

  /** Read the recaps Claude Code wrote today in the transcripts under
   *  `projectsDir` (also the ones from before the office started). */
  readRecapsFrom(projectsDir: string): void {
    this.projectsDir = projectsDir;
  }

  /** A recap an agent's transcript just got (transcriptParser). */
  recap(agentId: number, text: string, at: number): void {
    const clean = text.trim();
    if (!clean || this.hasRecap(clean)) return;
    this.add(agentId, 'recap', clean, { at });
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
      case 'agentChatAppend':
        return this.chat(id, message.items);
      case 'agentClosed':
        if (id !== undefined) this.settleTurn(id);
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
    if (waiting && mem.waiting === false && !mem.background && !mem.settling) {
      mem.settling = { at: this.now() };
      if (this.settleMs > 0) {
        mem.settling.timer = setTimeout(() => this.settleTurn(id), this.settleMs);
      } else {
        this.settleTurn(id);
      }
    }
    mem.waiting = waiting;
  }

  /** What it said and edited, from the chat lines of its transcript. */
  private chat(id: number | undefined, items: unknown): void {
    if (id === undefined || !Array.isArray(items)) return;
    const mem = this.memory(id);
    for (const item of items as Array<{ role?: string; text?: unknown }>) {
      if (typeof item.text !== 'string') continue;
      if (item.role === 'assistant') mem.lastSaid = item.text;
      else if (item.role === 'tool' && EDIT_LINE.test(item.text)) mem.edits++;
    }
  }

  /** Write the finished turn with what it did, and start counting anew. */
  private settleTurn(id: number): void {
    const mem = this.agents.get(id);
    if (!mem?.settling) return;
    clearTimeout(mem.settling.timer);
    const { at } = mem.settling;
    const summary = turnSummary(mem.lastSaid);
    const edits = mem.edits;
    mem.settling = undefined;
    mem.lastSaid = undefined;
    mem.edits = 0;
    this.add(id, 'termino', 'Terminó su turno', {
      at,
      summary,
      edits: edits > 0 ? edits : undefined,
    });
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

  private hasRecap(text: string): boolean {
    return this.entries.some((e) => e.kind === 'recap' && e.text === text);
  }

  /** Today's recaps not logged yet, from every transcript written today. A
   *  transcript read before is read again only when it grew. */
  private catchUpRecaps(): void {
    if (!this.projectsDir) return;
    for (const file of transcriptsOfDay(this.projectsDir, this.day, localDay)) {
      let size: number;
      try {
        size = fs.statSync(file).size;
      } catch {
        continue;
      }
      if (this.recapsRead.get(file) === size) continue;
      this.recapsRead.set(file, size);
      const { recaps, title } = readRecaps(file, this.day, localDay);
      for (const r of recaps) {
        if (this.hasRecap(r.text)) continue;
        const live = this.agentOfSession(r.sessionId);
        const folder = r.cwd ? path.basename(r.cwd) : undefined;
        this.add(live, 'recap', r.text, {
          at: r.at,
          agent: live === undefined ? this.sessionName(r.sessionId, title, folder) : undefined,
          folder,
          sessionId: r.sessionId,
        });
      }
    }
  }

  private agentOfSession(sessionId: string): number | undefined {
    for (const [id, agent] of this.store) if (agent.sessionId === sessionId) return id;
    return undefined;
  }

  /** A session that is not running now, named as today's history named it,
   *  else as the office saved it, else by its Claude Code title or folder. */
  private sessionName(sessionId: string, title?: string, folder?: string): string | undefined {
    const logged = [...this.entries]
      .reverse()
      .find((e) => e.sessionId === sessionId && e.kind !== 'recap');
    return logged?.agent ?? this.officeName(sessionId) ?? title ?? folder;
  }

  /** The name the office gave a session it runs (its saved sessions). */
  private officeName(sessionId: string): string | undefined {
    try {
      const saved = JSON.parse(
        fs.readFileSync(path.join(this.dir, 'oficina-sesiones.json'), 'utf-8'),
      ) as Array<{ sessionId?: string; nickname?: string }>;
      return saved.find((s) => s.sessionId === sessionId)?.nickname || undefined;
    } catch {
      return undefined;
    }
  }

  private alreadyLogged(id: number, text: string): boolean {
    const agent = this.nameOf(id);
    return this.entries.some((e) => e.text === text && e.agent === agent);
  }

  private memory(id: number): AgentMemory {
    let mem = this.agents.get(id);
    if (!mem) {
      mem = { completed: new Set(), edits: 0 };
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
    const entry: DayLogEntry = { at: extra.at ?? this.now(), agentId, agent, kind, text };
    if (extra.waitedMs !== undefined) entry.waitedMs = extra.waitedMs;
    if (extra.prUrl) entry.prUrl = extra.prUrl;
    if (extra.summary) entry.summary = extra.summary;
    if (extra.edits) entry.edits = extra.edits;
    const sessionId =
      extra.sessionId ?? (agentId === undefined ? undefined : this.store.get(agentId)?.sessionId);
    if (sessionId) entry.sessionId = sessionId;
    const folder = extra.folder ?? this.folderOf(agentId);
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
