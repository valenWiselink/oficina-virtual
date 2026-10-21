import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentStateStore } from './agentStateStore.js';
import { CONTEXT_SEED_TAIL_BYTES, SERVER_JSON_DIR } from './constants.js';
import type { PendingPermission, PermissionBroker } from './permissionBroker.js';
import { tailLines } from './resumeState.js';
import type { AgentState } from './types.js';

const FILE_NAME = 'permisos-en-terminal.json';
/** An ask older than this is not taken back: the session moved on or died. */
const MAX_AGE_MS = 12 * 60 * 60_000;
/** How long after the office starts a saved ask waits for its agent. */
const RESTORE_WINDOW_MS = 10 * 60_000;
/** Records this close to the ask are its own (the tool call, its hooks). */
const OWN_RECORDS_SLACK_MS = 2000;
/** Tool input fields longer than this are left out of the saved copy (a
 *  Write's whole file): matching the finished call needs only the rest. */
const MAX_SAVED_FIELD_CHARS = 2000;

type Broker = Pick<PermissionBroker, 'pending' | 'askedInTerminal' | 'rememberAskedInTerminal'>;

function isAsk(value: unknown): value is PendingPermission {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.requestId === 'string' &&
    typeof v.sessionId === 'string' &&
    typeof v.toolName === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.toolInput === 'object' &&
    v.toolInput !== null
  );
}

/**
 * Whether the session wrote something after `since` that gets past a
 * permission prompt: an answer, a prompt, a tool result, a finished turn.
 * While Claude Code waits on a permission it writes nothing (measured
 * 2026-10-20: 8 minutes of silence between a tool_use and its result).
 */
export function movedOnSince(lines: readonly string[], since: number): boolean {
  return lines.some((line) => {
    if (!line.startsWith('{')) return false;
    try {
      const r = JSON.parse(line) as { type?: string; subtype?: string; timestamp?: string };
      const at = Date.parse(r.timestamp ?? '');
      if (!Number.isFinite(at) || at <= since + OWN_RECORDS_SLACK_MS) return false;
      return (
        r.type === 'user' ||
        r.type === 'assistant' ||
        (r.type === 'system' && r.subtype === 'turn_duration')
      );
    } catch {
      return false;
    }
  });
}

/** The session outlives the office: a background session (the office only
 *  attached to it) or one running outside the office. The Claude an office
 *  terminal runs itself dies with the office, and its permission with it. */
export function survivesRestart(agent: AgentState): boolean {
  return agent.bgId !== undefined || agent.isExternal;
}

/** The ask without input fields too long to keep. */
function savedCopy(ask: PendingPermission): PendingPermission {
  const toolInput = Object.fromEntries(
    Object.entries(ask.toolInput).filter(
      ([, value]) => (JSON.stringify(value) ?? '').length <= MAX_SAVED_FIELD_CHARS,
    ),
  );
  return { ...ask, toolInput };
}

/**
 * Permission requests survive an office restart. Claude Code keeps asking in
 * the terminal while the office is down (a background session outlives it),
 * but the office's memory of it does not: on its way back the agent showed
 * "Trabajando". So what is still asked is saved on every change (a crash
 * included), and taken back when its agent comes back — unless its
 * transcript shows the session moved on meanwhile.
 */
export class TerminalAsks {
  private restoring: PendingPermission[] = [];
  private restoreUntil = 0;
  private frozen = false;

  constructor(
    private readonly store: AgentStateStore,
    private readonly broker: () => Broker,
    private readonly filePath = path.join(os.homedir(), SERVER_JSON_DIR, FILE_NAME),
    private readonly now: () => number = Date.now,
  ) {}

  /** Write what is asked now (held or only in the terminal) by sessions that
   *  outlive the office, plus saved asks still waiting for their agent. */
  save(): void {
    if (this.frozen) return;
    const broker = this.broker();
    const asked = [...broker.pending(), ...broker.askedInTerminal()].filter((ask) => {
      const agent = this.agentOf(ask.sessionId);
      return agent !== undefined && survivesRestart(agent);
    });
    const waiting = this.now() <= this.restoreUntil ? this.restoring : [];
    const all = [...asked, ...waiting].map(savedCopy);
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2));
    } catch {
      /* best effort: the office still works, it only forgets on restart */
    }
  }

  /** Office going down: its terminals close and their agents leave the
   *  store, which must not erase what the last save kept for them. */
  freeze(): void {
    this.frozen = true;
  }

  /** At start: take back what was saved, as each agent comes back. */
  start(): void {
    this.restoring = this.load();
    this.restoreUntil = this.now() + RESTORE_WINDOW_MS;
    if (this.restoring.length === 0) return;
    // After the store's own listeners (the socket's agentCreated) ran.
    this.store.on('agentAdded', (id) => setImmediate(() => this.restoreFor(id)));
    for (const [id] of this.store) this.restoreFor(id);
  }

  private load(): PendingPermission[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
      const oldest = this.now() - MAX_AGE_MS;
      return Array.isArray(parsed) ? parsed.filter(isAsk).filter((a) => a.createdAt > oldest) : [];
    } catch {
      return [];
    }
  }

  private restoreFor(id: number): void {
    if (this.restoring.length === 0 || this.now() > this.restoreUntil) return;
    const agent = this.store.get(id);
    if (!agent?.sessionId || agent.leadAgentId !== undefined) return;
    const asks = this.restoring.filter((a) => a.sessionId === agent.sessionId);
    if (asks.length === 0) return;
    this.restoring = this.restoring.filter((a) => a.sessionId !== agent.sessionId);
    const newest = Math.max(...asks.map((a) => a.createdAt));
    if (movedOnSince(tailLines(agent.jsonlFile, CONTEXT_SEED_TAIL_BYTES), newest)) {
      this.save();
      return;
    }
    for (const ask of asks) this.broker().rememberAskedInTerminal(ask);
    const since = Math.min(...asks.map((a) => a.createdAt));
    agent.permissionSent = true;
    agent.permissionSince = since;
    // The ask came from a hook: like any hook signal it must outlast new
    // transcript lines, which only clear a permission the office guessed
    // (fileWatcher readNewLines) — measured: a hook-failure record did.
    agent.hookDelivered = true;
    this.store.broadcast({ type: 'agentToolPermission', id, since });
  }

  private agentOf(sessionId: string): AgentState | undefined {
    for (const [, agent] of this.store) {
      if (agent.sessionId === sessionId && agent.leadAgentId === undefined) return agent;
    }
    return undefined;
  }
}
