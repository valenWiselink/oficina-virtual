import type { AgentIdentity, PermissionPending } from '../../../core/src/messages.js';
import { statusText } from '../identity/statusText.js';

/** What an agent is doing, as the views show it. */
export type AgentKind = 'needs' | 'meet' | 'research' | 'work' | 'think' | 'done' | 'idle';

/** Board column per kind. Thinking and running a tool are both "busy" to the
 *  operator, so they share a column; the card still says which. "Terminó"
 *  (a finished turn with an answer to read) and "Sin tarea" stay apart. */
export const BOARD_COLUMNS = [
  { id: 'needs', title: 'Te necesita', kinds: ['needs'] },
  { id: 'work', title: 'Trabajando', kinds: ['meet', 'research', 'work', 'think'] },
  { id: 'done', title: 'Terminó', kinds: ['done'] },
  { id: 'idle', title: 'Sin tarea', kinds: ['idle'] },
] as const satisfies ReadonlyArray<{ id: string; title: string; kinds: readonly AgentKind[] }>;

/** The one colour of each state, everywhere (board dot, terminal tab, graph,
 *  terminal header): busy is one colour whatever the activity, and finished
 *  is never painted like "no task". */
export const KIND_COLOR: Record<AgentKind, string> = {
  needs: 'var(--color-status-permission)',
  meet: 'var(--color-status-active)',
  research: 'var(--color-status-active)',
  work: 'var(--color-status-active)',
  think: 'var(--color-status-active)',
  done: 'var(--color-status-success)',
  idle: 'var(--color-border-strong)',
};

export interface SubagentView {
  id: number;
  label: string;
  kind: AgentKind;
  statusText: string;
}

export interface AgentView {
  id: number;
  name: string;
  palette: number;
  hueShift: number;
  kind: AgentKind;
  statusText: string;
  ticket?: string;
  /** Its folder when it differs from the name (for the card's meta line). */
  folder?: string;
  /** The folder it works in, always (last segment of the session cwd, else
   *  the Directory it was launched in): what workspaces group by. */
  dir?: string;
  /** "3/7" when the agent keeps a task list. */
  progress?: string;
  /** 0-100, how much of the context window is used. */
  contextPct?: number;
  subagents: SubagentView[];
  /** The office owns its terminal (can type into it, pass results to it). */
  hasTerminal: boolean;
  /** A held permission request the office can answer right here. */
  permission?: PermissionPending;
  /** Set when the finished turn left something for you ("te toca"). */
  yourTurnId?: string;
  /** "Te necesita" only: since when (ms, from the server's own clock — a
   *  permission's arrival or the answer's record). Absent when unknown: the
   *  office does not start counting at page load. */
  waitingSince?: number;
  /** Stable across office restarts (its session), for what you set by hand
   *  like where it sits on the graph; falls back to its name. */
  key: string;
  /** Git branch, when the session is on one. */
  branch?: string;
  /** Its own task list (the graph's close-up shows it). */
  tasks: Array<{ subject: string; status: 'pending' | 'in_progress' | 'completed' }>;
  /** Start of its latest answer, one line. */
  lastReplyHead?: string;
  /** When its session last wrote anything (server clock) — how long it has
   *  really been still. */
  lastRecordAt?: number;
  /** Kind of repository it works in (backend, webapp, flutter, otros). */
  area?: string;
  /** The pull request a "te toca" points at. */
  prUrl?: string;
  /** "Te necesita" only: it blocks the agent (permission or question), as
   *  opposed to something left for you at the end of a turn. */
  blocking?: boolean;
}

/** Minimal per-character facts the views need (OfficeState's Character). */
export interface CharacterFacts {
  palette: number;
  hueShift: number;
  isActive: boolean;
  bubbleType: 'permission' | 'waiting' | null;
  contextTokens: number;
  maxContextTokens: number;
  agentName?: string;
  directoryName?: string;
}

export interface ToolRow {
  status: string;
  done: boolean;
  permissionWait?: boolean;
}

export interface ViewInputs {
  agentIds: number[];
  characters: Map<number, CharacterFacts>;
  agentTools: Record<number, ToolRow[]>;
  subagents: Array<{ id: number; parentAgentId: number; parentToolId: string; label: string }>;
  subagentTools: Record<number, Record<string, ToolRow[]>>;
  permissions: PermissionPending[];
  terminalAgentIds: number[];
  identity: (id: number) => AgentIdentity | undefined;
  /** The agent ended its turn and is waiting (from its status, which lasts
   *  until the next turn — unlike the old office's 2-second bubble). */
  finished: (id: number) => boolean;
  /** "Te toca" answers the operator already marked done. */
  yourTurnDone: (turnId: string) => boolean;
  inTurn: (id: number) => boolean;
  researching: (id: number) => boolean;
}

/** A meeting is an agent working with this many subagents at once. */
const MEETING_MIN_SUBAGENTS = 2;
const ASKING_STATUS = 'Waiting for your answer';

function folderName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).filter(Boolean).pop();
}

/** "Te necesita" order: what blocks an agent first, then the longest wait. */
export function byUrgency(a: AgentView, b: AgentView): number {
  if (!!a.blocking !== !!b.blocking) return a.blocking ? -1 : 1;
  const wa = a.waitingSince ?? Infinity;
  const wb = b.waitingSince ?? Infinity;
  return wa !== wb ? wa - wb : a.id - b.id;
}

/** "hace 12 min" for a wait; "recién" under a minute. */
export function waitedFor(since: number, now: number): string {
  const min = Math.floor((now - since) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${min % 60} min`;
}

/** The finished answer leaves you something you have not marked done. */
function pendingAsk(
  identity: AgentIdentity | undefined,
  done: (turnId: string) => boolean,
): boolean {
  return !!identity?.yourTurn && !!identity.yourTurnId && !done(identity.yourTurnId);
}

function liveTool(rows: ToolRow[] | undefined): ToolRow | undefined {
  return rows ? [...rows].reverse().find((t) => !t.done) : undefined;
}

/**
 * Every top-level agent as the board and the graph show it. Each state comes
 * from evidence the office actually has (a held permission, a running tool, a
 * turn in progress); with none of it, the agent is idle — never guessed busy.
 */
export function buildAgentViews(input: ViewInputs): AgentView[] {
  return input.agentIds.flatMap((id) => {
    const ch = input.characters.get(id);
    if (!ch) return [];
    const identity = input.identity(id);
    const subs = input.subagents
      .filter((s) => s.parentAgentId === id)
      .map((s): SubagentView => {
        const tool = liveTool(input.subagentTools[id]?.[s.parentToolId]);
        const kind: AgentKind = tool?.permissionWait
          ? 'needs'
          : input.researching(s.id)
            ? 'research'
            : tool
              ? 'work'
              : 'think';
        return {
          id: s.id,
          label: s.label || 'Subagente',
          kind,
          statusText: statusText(tool?.status ?? 'Thinking'),
        };
      });

    const permission = input.permissions.find((p) => p.id === id);
    const tool = liveTool(input.agentTools[id]);
    const task = identity?.tasks.find((t) => t.status === 'in_progress');
    let kind: AgentKind;
    let text: string;
    if (permission || ch.bubbleType === 'permission' || tool?.permissionWait) {
      kind = 'needs';
      text = 'Necesita tu permiso';
    } else if (tool?.status === ASKING_STATUS) {
      // Only a real question (AskUserQuestion). Claude Code's idle_prompt
      // ("waiting for your input") just means the session sat idle: not a
      // question, and saying so would be a lie.
      kind = 'needs';
      text = 'Te hizo una pregunta';
    } else if (subs.length >= MEETING_MIN_SUBAGENTS) {
      kind = 'meet';
      text = `En junta · ${subs.length} subagentes`;
    } else if (subs.length === 1 && !tool && !(ch.isActive && input.inTurn(id))) {
      // Its own turn ended but a sub-agent it started is still at work.
      kind = 'work';
      text = `Con un subagente: ${subs[0].label}`;
    } else if (input.researching(id)) {
      kind = 'research';
      text = task?.activeForm ?? 'Investigando';
    } else if (tool) {
      kind = 'work';
      text = task?.activeForm ?? statusText(tool.status);
    } else if (ch.isActive && input.inTurn(id)) {
      kind = 'think';
      text = task?.activeForm ?? 'Pensando…';
    } else if ((identity?.backgroundTasks ?? 0) > 0) {
      // Its turn may be over, but work it launched in the background is
      // still running and it will go on when that reports back.
      kind = 'work';
      text = identity?.backgroundLabel
        ? 'Esperando: ' + identity.backgroundLabel
        : 'Esperando un proceso de fondo';
    } else if (input.finished(id) && pendingAsk(identity, input.yourTurnDone)) {
      kind = 'needs';
      text = `Te toca: ${identity!.yourTurn}`;
    } else if (input.finished(id)) {
      kind = 'done';
      text = 'Terminó';
    } else {
      kind = 'idle';
      text = 'Sin tarea';
    }

    const asksYou = kind === 'needs' && !permission && pendingAsk(identity, input.yourTurnDone);
    const tasks = identity?.tasks ?? [];
    const done = tasks.filter((t) => t.status === 'completed').length;
    const folder = folderName(identity?.cwd);
    const name =
      identity?.nickname ??
      identity?.title ??
      ch.agentName ??
      folder ??
      ch.directoryName ??
      `Agente ${id}`;
    return [
      {
        id,
        name,
        palette: ch.palette,
        hueShift: ch.hueShift,
        kind,
        statusText: text,
        ticket: identity?.ticket,
        folder: folder !== name ? folder : undefined,
        dir: folder ?? ch.directoryName,
        progress: tasks.length > 0 ? `${done}/${tasks.length}` : undefined,
        contextPct:
          ch.contextTokens > 0
            ? Math.round((ch.contextTokens / ch.maxContextTokens) * 100)
            : undefined,
        subagents: subs,
        hasTerminal: input.terminalAgentIds.includes(id),
        permission,
        yourTurnId: asksYou ? identity!.yourTurnId : undefined,
        prUrl: asksYou ? identity?.yourTurnUrl : undefined,
        branch: identity?.gitBranch,
        key: identity?.sessionId ?? name,
        tasks: tasks.map((t) => ({ subject: t.subject, status: t.status })),
        lastReplyHead: identity?.lastReplyHead,
        lastRecordAt: identity?.lastRecordAt,
        area: identity?.area,
        waitingSince: permission?.createdAt ?? (asksYou ? identity?.yourTurnAt : undefined),
        blocking: kind === 'needs' && !asksYou,
      },
    ];
  });
}
