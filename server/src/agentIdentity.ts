import * as fs from 'fs';

import { prAskOf, prStateOf, rememberPrLinks } from './mergedAsk.js';
import { replyChoices } from './replyChoices.js';
import { repoAreaOf } from './repoArea.js';
import { supervisors } from './supervisors/supervision.js';
import type { AgentState, AgentTask } from './types.js';

/** Bytes read from each end of a transcript to seed identity for a session the
 *  office starts watching mid-way (adopted, restored or resumed). */
const SEED_HEAD_BYTES = 64 * 1024;
const SEED_TAIL_BYTES = 1024 * 1024;

type TaskStatus = AgentTask['status'];

function taskStatus(value: unknown): TaskStatus | 'deleted' | undefined {
  return value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'deleted'
    ? value
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Read who an agent is from one transcript record: its title (/rename beats
 * Claude's generated one), working directory, git branch and task list.
 * Returns true when anything the office shows changed.
 *
 * Everything here comes straight from Claude Code's own records — nothing is
 * inferred — so the label never claims something the session did not say.
 */
export function observeIdentity(agent: AgentState, record: Record<string, unknown>): boolean {
  let changed = false;
  const set = <K extends 'sessionTitle' | 'cwd' | 'gitBranch' | 'entrypoint'>(
    key: K,
    value: string | undefined,
  ) => {
    if (value !== undefined && agent[key] !== value) {
      agent[key] = value;
      changed = true;
    }
  };

  if (record.type === 'custom-title') {
    const title = str(record.customTitle);
    if (title) {
      agent.sessionTitleIsCustom = true;
      set('sessionTitle', title);
    }
  } else if (record.type === 'ai-title' && !agent.sessionTitleIsCustom) {
    set('sessionTitle', str(record.aiTitle));
  }

  set('cwd', str(record.cwd));
  const branch = str(record.gitBranch);
  // "HEAD" is a detached checkout, not a branch name worth showing.
  if (branch && branch !== 'HEAD') set('gitBranch', branch);
  set('entrypoint', str(record.entrypoint));
  // The effort a turn ran with: on the main chain's assistant records only
  // (a subagent's turn says nothing about this agent).
  // `/effort` typed in its terminal says so right away (the next turn would
  // too): "Set effort level to xhigh (saved as…)".
  const typed = effortSetBy(record);
  if (typed && agent.effort !== typed) {
    agent.effort = typed;
    changed = true;
  }
  if (record.type === 'assistant' && record.isSidechain !== true) {
    const effort = str(record.effort);
    if (effort && agent.effort !== effort) {
      agent.effort = effort;
      changed = true;
    }
  }

  if (observeTasks(agent, record)) changed = true;
  if (observeLastReply(agent, record)) changed = true;
  if (observeRecordTime(agent, record)) changed = true;
  if (observeBackground(agent, record)) changed = true;
  return changed;
}

/** The time of the session's latest record (what "asleep" is measured from).
 *  Counts as a change once per minute, so idle timing stays current without
 *  a broadcast per record. */
function observeRecordTime(agent: AgentState, record: Record<string, unknown>): boolean {
  if (record.isSidechain === true || typeof record.timestamp !== 'string') return false;
  const at = Date.parse(record.timestamp);
  if (Number.isNaN(at) || (agent.lastRecordAt !== undefined && at <= agent.lastRecordAt)) {
    return false;
  }
  const minuteBefore =
    agent.lastRecordAt === undefined ? -1 : Math.floor(agent.lastRecordAt / 60_000);
  agent.lastRecordAt = at;
  return Math.floor(at / 60_000) !== minuteBefore;
}

/** Background work older than this without a report is not trusted as running
 *  (its session may have restarted and taken it down silently). */
const BACKGROUND_TRUST_MS = 2 * 60 * 60 * 1000;
/** Tools that always run in the background and report back later. */
const ALWAYS_BACKGROUND = new Set(['Workflow']);

/**
 * Track work the agent left running in the background: it starts with a
 * tool_use flagged run_in_background (or a Workflow), and ends with the
 * <task-notification> Claude Code writes when it completes, fails or is
 * killed — that record names the launching tool_use id — or with a TaskStop
 * of its task id. Returns true when the set changed.
 */
function observeBackground(agent: AgentState, record: Record<string, unknown>): boolean {
  if (record.isSidechain === true) return false;
  const content = (record.message as { content?: unknown } | undefined)?.content;
  const parsed = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
  const at = Number.isNaN(parsed) ? Date.now() : parsed;
  const bg = (agent.background ??= new Map());
  let changed = false;
  if (record.type === 'assistant' && Array.isArray(content)) {
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type !== 'tool_use' || typeof block.id !== 'string') continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      if (input.run_in_background !== true && !ALWAYS_BACKGROUND.has(String(block.name))) continue;
      const label =
        str(input.description) ?? str(input.command)?.split('\n')[0] ?? String(block.name);
      bg.set(block.id, { label: label.slice(0, 80), at });
      changed = true;
    }
  }
  if (record.type !== 'user') return changed;
  for (const { launch, text } of userTexts(content)) {
    if (backgroundEnded(agent, launch, text)) changed = true;
  }
  return changed;
}

/** The texts of a user record, each with the tool_use it answers (if any). */
function userTexts(content: unknown): Array<{ launch?: string; text: string }> {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [];
  return (content as Array<Record<string, unknown>>).flatMap((b) =>
    b.type === 'tool_result'
      ? resultTexts(b).map((text) => ({ launch: String(b.tool_use_id), text }))
      : typeof b.text === 'string'
        ? [{ text: b.text }]
        : [],
  );
}

/** Learn a launch's task id, or end a background job; true when one ended. */
function backgroundEnded(agent: AgentState, launch: string | undefined, text: string): boolean {
  const bg = agent.background!;
  const ids = (agent.backgroundIds ??= new Map());
  const started = text.match(/running in background with ID: (\w+)/);
  if (launch && started) ids.set(started[1], launch);
  const done = text.match(/<task-notification>[\s\S]*?<tool-use-id>([^<]+)<\/tool-use-id>/);
  if (done) return bg.delete(done[1]);
  const stopped = text.match(/stopped task: (\w+)/);
  const stoppedLaunch = stopped ? ids.get(stopped[1]) : undefined;
  return stoppedLaunch ? bg.delete(stoppedLaunch) : false;
}

function resultTexts(block: Record<string, unknown>): string[] {
  const c = block.content;
  if (typeof c === 'string') return [c];
  if (!Array.isArray(c)) return [];
  return (c as Array<Record<string, unknown>>).flatMap((x) =>
    typeof x.text === 'string' ? [x.text] : [],
  );
}

/** Background work still believed running (recent enough to trust). */
export function runningBackground(agent: AgentState, now = Date.now()): Array<{ label: string }> {
  return [...(agent.background?.values() ?? [])].filter((b) => now - b.at < BACKGROUND_TRUST_MS);
}

/** Keep the agent's latest text answer (main conversation only, not its
 *  subagents' sidechains) — what "pass the result on" hands to another
 *  agent — and what it leaves for you to do. Returns true when the latter
 *  changed (the reply itself is not shown). */
function observeLastReply(agent: AgentState, record: Record<string, unknown>): boolean {
  if (record.type !== 'assistant' || record.isSidechain === true) return false;
  const content = (record.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return false;
  const text = (content as Array<{ type?: string; text?: unknown }>)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n')
    .trim();
  if (!text) return false;
  const headBefore = replyHead(agent.lastReply);
  const extrasBefore = JSON.stringify([agent.replyLink, agent.replyChoices]);
  agent.lastReply = text;
  const headChanged = replyHead(text) !== headBefore;
  const before = agent.yourTurn;
  rememberPrLinks((agent.prLinks ??= new Map()), text);
  agent.yourTurn = yourTurnRecord(agent, text, record);
  agent.replyLink = firstOtherLink(text);
  agent.replyChoices = replyChoices(text, agent.yourTurn?.text);
  return (
    headChanged ||
    before?.text !== agent.yourTurn?.text ||
    before?.id !== agent.yourTurn?.id ||
    extrasBefore !== JSON.stringify([agent.replyLink, agent.replyChoices])
  );
}

/** A PR the office already saw merged or closed asks nothing of you. */
function isSettledPr(url: string): boolean {
  const state = prStateOf(url);
  return state === 'merged' || state === 'closed';
}

/** The "te toca" of an answer, with the one PR it is only about (if any) —
 *  already done when that PR is known merged. */
function yourTurnRecord(
  agent: AgentState,
  text: string,
  record: Record<string, unknown>,
): AgentState['yourTurn'] | undefined {
  const ask = yourTurnOf(text, isSettledPr);
  if (!ask) return undefined;
  const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
  const prAsk = prAskOf(ask, text, agent.prLinks);
  return {
    text: ask,
    id: String(record.uuid ?? text.length),
    at: Number.isNaN(at) ? undefined : at,
    prUrl: prAsk?.url ?? firstPrUrl(text, isSettledPr),
    prAsk,
    merged:
      prAsk && prStateOf(prAsk.url) === 'merged'
        ? { number: prAsk.number, url: prAsk.url, told: false }
        : undefined,
  };
}

/** Long enough for a whole ask: at 120, 16 of 118 arrived cut (2026-10-20). */
const YOUR_TURN_MAX = 240;
/** "Te toca: …" on a line of its own (bold, quoted or arrowed is fine). */
const YOUR_TURN_LINE = /^[\s>*_\-→]*te toca\**\s*:\**\s*(.+)$/im;
const PR_LINK = /https:\/\/github\.com\/[^/\s)]+\/([^/\s)]+)\/pull\/(\d+)/g;

/**
 * What an answer leaves for the operator. The agent's own words come first: a
 * line "Te toca: mergear PR #812" (the global CLAUDE.md asks for it). Without
 * one, pull-request links are the evidence — a PR handed over waits on you,
 * unless it is already merged or closed (`settled`): "Se mergeó #2563" is
 * news, not a review to do. Anything else (a summary, a plain "listo") asks
 * nothing, and the office does not guess.
 */
export function yourTurnOf(
  reply: string,
  settled: (url: string) => boolean = () => false,
): string | undefined {
  const line = reply.match(YOUR_TURN_LINE)?.[1];
  if (line) {
    const clean = line.replace(/[*_`]/g, '').trim();
    if (clean) return clip(clean, YOUR_TURN_MAX);
  }
  const prs = new Map<string, string>();
  for (const m of reply.matchAll(PR_LINK)) {
    if (!settled(m[0])) prs.set(`${m[1]}#${m[2]}`, m[1]);
  }
  if (prs.size === 0) return undefined;
  const repos = new Set(prs.values());
  const numbers = [...prs.keys()].map((k) => `#${k.split('#')[1]}`);
  const where = repos.size === 1 ? ` (${[...repos][0]})` : '';
  return prs.size === 1
    ? `revisar el PR ${numbers[0]}${where}`
    : `revisar ${prs.size} PRs: ${numbers.join(', ')}${where}`;
}

const REPLY_HEAD_MAX = 140;
/** The start of an answer, on one line (the graph's close-up shows it). */
export function replyHead(reply: string | undefined): string | undefined {
  if (!reply) return undefined;
  const flat = reply
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat ? clip(flat, REPLY_HEAD_MAX) : undefined;
}

/** The first pull request the answer links (and is not `skip`ped), for an
 *  "Abrir PR" button. */
export function firstPrUrl(
  reply: string,
  skip: (url: string) => boolean = () => false,
): string | undefined {
  for (const m of reply.matchAll(PR_LINK)) if (!skip(m[0])) return m[0];
  return undefined;
}

const ANY_LINK = /https?:\/\/[^\s<>()[\]"'`]+/g;
const PR_PAGE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

/** The answer's first link that is not a pull request (a dev URL, an
 *  artifact, a release), for an "Abrir" button. */
export function firstOtherLink(reply: string): string | undefined {
  for (const m of reply.matchAll(ANY_LINK)) {
    const url = m[0].replace(/[.,;:!?»*_]+$/, '');
    if (!PR_PAGE.test(url)) return url;
  }
  return undefined;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** How the office names an agent to another agent: nickname, else session
 *  title, else its folder. */
export function spokenName(agent: AgentState): string {
  return agent.nickname ?? agent.sessionTitle ?? agent.cwd?.split(/[\\/]/).pop() ?? 'otro agente';
}

/** Tool uses and results that build the task list. */
function observeTasks(agent: AgentState, record: Record<string, unknown>): boolean {
  const message = record.message as { content?: unknown } | undefined;
  const content = Array.isArray(message?.content)
    ? (message.content as Record<string, unknown>[])
    : [];
  let changed = false;

  if (record.type === 'assistant') {
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      if (block.name === 'TaskCreate' && str(input.subject)) {
        agent.tasks = [
          ...(agent.tasks ?? []),
          {
            id: String(block.id),
            subject: str(input.subject)!,
            activeForm: str(input.activeForm),
            status: 'pending',
          },
        ];
        changed = true;
      } else if (block.name === 'TaskUpdate' && agent.tasks) {
        changed = applyTaskUpdate(agent, input) || changed;
      } else if (block.name === 'TodoWrite' && Array.isArray(input.todos)) {
        agent.tasks = (input.todos as Record<string, unknown>[]).flatMap((todo, i) => {
          const status = taskStatus(todo.status);
          const subject = str(todo.content);
          if (!subject || !status || status === 'deleted') return [];
          return [{ id: String(i + 1), subject, activeForm: str(todo.activeForm), status }];
        });
        changed = true;
      }
    }
  } else if (record.type === 'user' && agent.tasks) {
    // TaskCreate's result carries the real id later TaskUpdates refer to.
    const created = (record.toolUseResult as { task?: { id?: unknown } } | undefined)?.task?.id;
    for (const block of content) {
      if (block.type !== 'tool_result' || created === undefined) continue;
      const task = agent.tasks.find((t) => t.id === block.tool_use_id);
      if (task) task.id = String(created);
    }
  }
  return changed;
}

function applyTaskUpdate(agent: AgentState, input: Record<string, unknown>): boolean {
  const id = input.taskId === undefined ? undefined : String(input.taskId);
  const task = agent.tasks?.find((t) => t.id === id);
  if (!task) return false;
  const status = taskStatus(input.status);
  if (status === 'deleted') {
    agent.tasks = agent.tasks!.filter((t) => t !== task);
    return true;
  }
  if (status) task.status = status;
  task.subject = str(input.subject) ?? task.subject;
  task.activeForm = str(input.activeForm) ?? task.activeForm;
  return true;
}

/** First WISE-1234 ticket (Wiselink's Jira project) in the agent's name, title
 *  or branch — branches spell it lowercase (`feat/wise-6082-...`). A generic
 *  KEY-123 pattern would also catch "UTF-8" or "node-20". */
export function ticketOf(agent: AgentState): string | undefined {
  // The working folder too: a worktree per feature is named after its ticket
  // (`.worktrees/expo-online-WISE-5781-recupero`).
  const folder = agent.cwd?.split(/[\\/]/).pop();
  for (const text of [agent.nickname, agent.sessionTitle, agent.gitBranch, folder]) {
    const match = text?.match(/\bwise-(\d+)\b/i);
    if (match) return `WISE-${match[1]}`;
  }
  return undefined;
}

/** `agentIdentity`: everything the office's label and bubble show for an agent. */
export function identityMessage(id: number, agent: AgentState): Record<string, unknown> {
  const { repo, area } = repoAreaOf(agent.cwd);
  const supervisedBy = supervisors().supervisorsOf(agent.sessionId);
  return {
    type: 'agentIdentity',
    id,
    sessionId: agent.sessionId || undefined,
    nickname: agent.nickname,
    title: agent.sessionTitle,
    ticket: ticketOf(agent),
    cwd: agent.cwd,
    gitBranch: agent.gitBranch,
    entrypoint: agent.entrypoint,
    effort: agent.effort,
    runModel: agent.runModel,
    runEffort: agent.runEffort,
    canSetRun: agent.officeTerminal ? true : undefined,
    supervision: agent.supervision,
    supervisedBy: supervisedBy.length > 0 ? supervisedBy : undefined,
    repo,
    area,
    tasks: agent.tasks ?? [],
    yourTurn: agent.yourTurn?.text,
    yourTurnId: agent.yourTurn?.id,
    yourTurnAt: agent.yourTurn?.at,
    yourTurnUrl: agent.yourTurn?.prUrl,
    yourTurnMerged: agent.yourTurn?.merged,
    replyLink: agent.replyLink,
    replyChoices: agent.replyChoices,
    lastReplyHead: replyHead(agent.lastReply),
    lastRecordAt: agent.lastRecordAt,
    backgroundTasks: runningBackground(agent).length,
    backgroundLabel: runningBackground(agent).at(-1)?.label,
  };
}

/**
 * Seed identity for a session the office starts watching after it began:
 * the head carries cwd/branch, the tail the latest title and tasks. Records
 * are replayed in file order so later ones win, as they would live.
 */
export function seedIdentity(agent: AgentState, file: string): boolean {
  let text: string;
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    try {
      const read = (start: number, length: number): string => {
        const buf = Buffer.alloc(length);
        const n = fs.readSync(fd, buf, 0, length, start);
        return buf.subarray(0, n).toString('utf-8');
      };
      text =
        size <= SEED_HEAD_BYTES + SEED_TAIL_BYTES
          ? read(0, size)
          : `${read(0, SEED_HEAD_BYTES)}\n${read(size - SEED_TAIL_BYTES, SEED_TAIL_BYTES)}`;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
  let changed = false;
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue; // also skips a line cut by the tail window
    try {
      if (observeIdentity(agent, JSON.parse(line) as Record<string, unknown>)) changed = true;
    } catch {
      /* partial line at a window edge */
    }
  }
  return changed;
}

/** The effort a `/effort` command just set, from its output record. */
export function effortSetBy(record: Record<string, unknown>): string | undefined {
  if (record.type !== 'user' || record.isSidechain === true) return undefined;
  const content = (record.message as { content?: unknown } | undefined)?.content;
  if (typeof content !== 'string') return undefined;
  return EFFORT_SET.exec(content)?.[1];
}

const EFFORT_SET = /^<local-command-stdout>Set effort level to (low|medium|high|xhigh|max)\b/;
