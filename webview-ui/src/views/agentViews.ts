import type {
  AgentIdentity,
  MergedAsk,
  PermissionPending,
  ReplyChoices,
  SupervisionScope,
} from '../../../core/src/messages.js';
import { statusText } from '../identity/statusText.js';
import type { Spend } from './usageText.js';

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
  /** The context in tokens and its window, for the detail line. */
  contextTokens?: number;
  maxContextTokens?: number;
  /** Model of its newest turn (claude-opus-5-5). */
  model?: string;
  /** What its session spent so far (usageText.ts words it). */
  spend?: Spend;
  /** It runs in the Claude desktop app: the office shows it but can't bring
   *  it in (no "Traer"). */
  inClaudeApp?: boolean;
  /** Effort of its newest turn, as the transcript says ("high"). */
  effort?: string;
  /** Model and effort chosen from the office (absent = Claude Code's default). */
  runModel?: string;
  runEffort?: string;
  /** It runs in an office terminal, so its model and effort can be changed. */
  canSetRun: boolean;
  /** Set when it is a supervisor: what it watches over (a workspace, agents
   *  picked by hand, or everyone). */
  supervision?: SupervisionScope;
  /** Ids of the supervisors watching over it (empty = none). */
  supervisedBy: number[];
  /** Session of the supervisor that opened it (lanzar_agente), if one did. */
  launchedBy?: string;
  /** That supervisor's workspace: the agent belongs there unless it is moved
   *  by hand (workspaceRules). */
  home?: string;
  /** Their names, for the card ("Lo supervisa «Jefa»"). */
  supervisorNames: string[];
  /** For a supervisor: how many agents it watches over right now. */
  teamSize: number;
  /** Supervised and waiting: its supervisor handles it, so it shows as
   *  working ("Lo atiende «Jefa»") and only the supervisor comes to you. */
  askingSupervisor?: { id: number; name: string };
  subagents: SubagentView[];
  /** The office owns its terminal (can type into it, pass results to it). */
  hasTerminal: boolean;
  /** A held permission request the office can answer right here. */
  permission?: PermissionPending;
  /** It asks a permission the office cannot answer (the hold expired, the
   *  office restarted, or it never held it): only its terminal can. */
  asksInTerminal?: boolean;
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
  /** "Te necesita" only: what its "te toca" asks, whole. */
  yourTurn?: string;
  /** Its answer's first link that is not a PR ("Abrir"), on a "te toca" or
   *  a finished turn. */
  replyLink?: string;
  /** What that answer offers to pick with one tap (options, "Como
   *  recomendás"), on a "te toca" or a finished turn. */
  choices?: ReplyChoices;
  /** "Terminó" because the PR its "te toca" asked for got merged; `told`:
   *  the office already let it know. `turnId` is that answer's. */
  mergedPr?: MergedAsk & { turnId: string };
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
  model?: string;
  spend?: Spend;
  agentName?: string;
  directoryName?: string;
  /** A meeting member (Claude Code teammate): the agent that called it. */
  leadAgentId?: number;
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
  /** It asks a permission, held or not (from the messages: the bubble misses
   *  one replayed before its character exists). */
  askingPermission?: (id: number) => boolean;
  /** Since when it asks a permission (server clock), held or not. */
  permissionSince?: (id: number) => number | undefined;
  /** "Te toca" answers the operator already marked done. */
  yourTurnDone: (turnId: string) => boolean;
  inTurn: (id: number) => boolean;
  researching: (id: number) => boolean;
}

/** A meeting is an agent working with this many subagents at once. */
const MEETING_MIN_SUBAGENTS = 2;
const ASKING_STATUS = 'Waiting for your answer';
/** A permission only its terminal can answer now (no card here). */
const ASKS_IN_TERMINAL = 'Te pide permiso en la terminal';

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

/** The finished answer leaves you something you have not marked done (nor
 *  got done by merging the PR it asked for). */
function pendingAsk(
  identity: AgentIdentity | undefined,
  done: (turnId: string) => boolean,
): boolean {
  return (
    !!identity?.yourTurn &&
    !!identity.yourTurnId &&
    !identity.yourTurnMerged &&
    !done(identity.yourTurnId)
  );
}

/** What "Terminó" says: plain, or that the PR it asked for got merged. */
function doneText(merged: MergedAsk | undefined): string {
  if (!merged) return 'Terminó';
  return merged.told
    ? `Se mergeó el PR #${merged.number} y ya se enteró`
    : `Se mergeó el PR #${merged.number}`;
}

/** The extras of a finished answer the card offers: its link, its choices
 *  and, when its PR got merged, that PR. */
function answerExtras(
  identity: AgentIdentity | undefined,
  kind: AgentKind,
  asksYou: boolean,
): Pick<AgentView, 'replyLink' | 'choices' | 'mergedPr'> {
  if (!identity || (!asksYou && kind !== 'done')) return {};
  const merged = identity.yourTurnMerged;
  return {
    replyLink: identity.replyLink,
    choices: identity.replyChoices,
    mergedPr:
      kind === 'done' && merged && identity.yourTurnId
        ? { ...merged, turnId: identity.yourTurnId }
        : undefined,
  };
}

/** A meeting member as one of its lead's subagents. */
function memberView(input: ViewInputs, id: number): SubagentView {
  const ch = input.characters.get(id);
  const tool = liveTool(input.agentTools[id]);
  const asks = input.permissions.some((p) => p.id === id) || !!tool?.permissionWait;
  const kind: AgentKind = asks
    ? 'needs'
    : input.researching(id)
      ? 'research'
      : tool
        ? 'work'
        : ch?.isActive && input.inTurn(id)
          ? 'think'
          : 'done';
  return {
    id,
    label: ch?.agentName || 'Integrante',
    kind,
    statusText: asks
      ? 'Necesita tu permiso'
      : tool
        ? statusText(tool.status)
        : kind === 'think'
          ? 'Pensando…'
          : 'Esperando la junta',
  };
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
  const shown = new Set(input.agentIds);
  const leadOf = (id: number) => {
    const lead = input.characters.get(id)?.leadAgentId;
    return lead !== undefined && lead !== id && shown.has(lead) ? lead : undefined;
  };
  const views: AgentView[] = input.agentIds.flatMap((id) => {
    const ch = input.characters.get(id);
    if (!ch) return [];
    // A meeting member sits in its lead's meeting, not as an agent of its own
    // (measured 2026-10-20: seven members piled up as full bubbles).
    if (leadOf(id) !== undefined) return [];
    const identity = input.identity(id);
    const members = input.agentIds.filter((m) => leadOf(m) === id).map((m) => memberView(input, m));
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
      })
      .concat(members);

    // A meeting is on only while someone in it works: members that went idle
    // ("Esperando la junta") stay drawn around their lead but do not keep it
    // busy (2026-10-21: a lead showed "En junta" long after its own turn and
    // its four teammates had stopped).
    const working = subs.filter((s) => s.kind !== 'done' && s.kind !== 'idle');
    const permission = input.permissions.find((p) => p.id === id);
    const tool = liveTool(input.agentTools[id]);
    const task = identity?.tasks.find((t) => t.status === 'in_progress');
    let kind: AgentKind;
    let text: string;
    const asksPermission =
      ch.bubbleType === 'permission' ||
      !!tool?.permissionWait ||
      input.askingPermission?.(id) === true;
    if (permission) {
      kind = 'needs';
      text = 'Necesita tu permiso';
    } else if (tool?.status === ASKING_STATUS) {
      // Only a real question (AskUserQuestion). Claude Code's idle_prompt
      // ("waiting for your input") just means the session sat idle: not a
      // question, and saying so would be a lie.
      kind = 'needs';
      text = 'Te hizo una pregunta';
    } else if (asksPermission) {
      // Still asked, with no card to answer here: it stays in "Te necesita"
      // until the tool runs or the turn ends — never "Trabajando" while it
      // sits at the prompt (a hold expired after 9.5 min, 2026-10-20).
      kind = 'needs';
      text = ASKS_IN_TERMINAL;
    } else if (subs.length >= MEETING_MIN_SUBAGENTS && working.length > 0) {
      kind = 'meet';
      text = `En junta · ${subs.length} subagentes`;
    } else if (
      working.length === 1 &&
      subs.length === 1 &&
      !tool &&
      !(ch.isActive && input.inTurn(id))
    ) {
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
      text = doneText(identity?.yourTurnMerged);
    } else {
      kind = 'idle';
      text = 'Sin tarea';
    }

    const asksInTerminal = text === ASKS_IN_TERMINAL;
    const asksYou =
      kind === 'needs' &&
      !permission &&
      !asksInTerminal &&
      pendingAsk(identity, input.yourTurnDone);
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
        contextTokens: ch.contextTokens > 0 ? ch.contextTokens : undefined,
        maxContextTokens: ch.contextTokens > 0 ? ch.maxContextTokens : undefined,
        model: ch.model,
        spend: ch.spend,
        inClaudeApp: identity?.entrypoint === 'claude-desktop',
        effort: identity?.effort,
        runModel: identity?.runModel,
        runEffort: identity?.runEffort,
        canSetRun: identity?.canSetRun === true,
        supervision: identity?.supervision,
        supervisedBy: identity?.supervisedBy ?? [],
        launchedBy: identity?.launchedBy,
        subagents: subs,
        hasTerminal: input.terminalAgentIds.includes(id),
        permission,
        asksInTerminal: asksInTerminal || undefined,
        yourTurnId: asksYou ? identity!.yourTurnId : undefined,
        prUrl: asksYou ? identity?.yourTurnUrl : undefined,
        yourTurn: asksYou ? identity?.yourTurn : undefined,
        ...answerExtras(identity, kind, asksYou),
        branch: identity?.gitBranch,
        key: identity?.sessionId ?? name,
        tasks: tasks.map((t) => ({ subject: t.subject, status: t.status })),
        lastReplyHead: identity?.lastReplyHead,
        lastRecordAt: identity?.lastRecordAt,
        area: identity?.area,
        waitingSince:
          permission?.createdAt ??
          (asksInTerminal ? input.permissionSince?.(id) : undefined) ??
          (asksYou ? identity?.yourTurnAt : undefined),
        blocking: kind === 'needs' && !asksYou,
        supervisorNames: [],
        teamSize: 0,
      },
    ];
  });
  return withSupervisionNames(views);
}

/** Who watches over each agent, by name, how many each supervisor has, and
 *  the workspace of the supervisor that opened it (its home).
 *  A supervised agent that needs something waits on its supervisor, not on
 *  you: it leaves "Te necesita" (and the arrow to "Vos") for the supervisor
 *  alone — asked for 2026-10-20 ("que se me acerque solo el supervisor"). */
export function withSupervisionNames(views: AgentView[]): AgentView[] {
  const byId = new Map(views.map((v) => [v.id, v]));
  const byKey = new Map(views.map((v) => [v.key, v]));
  return views.map((v) => {
    const supervisorNames = v.supervisedBy.flatMap((id) => byId.get(id)?.name ?? []);
    const teamSize = views.filter((o) => o.supervisedBy.includes(v.id)).length;
    const opener = v.launchedBy ? byKey.get(v.launchedBy)?.supervision : undefined;
    const home = opener?.kind === 'workspace' ? opener.workspaceId : undefined;
    const boss =
      v.kind === 'needs' ? v.supervisedBy.map((id) => byId.get(id)).find(Boolean) : undefined;
    if (!boss) return { ...v, supervisorNames, teamSize, home };
    return {
      ...v,
      kind: 'work',
      statusText: `Lo atiende ${boss.name}`,
      askingSupervisor: { id: boss.id, name: boss.name },
      supervisorNames,
      teamSize,
      home,
    };
  });
}
