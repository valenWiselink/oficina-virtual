import type { DayLogEntry, PrStatus } from '../../../core/src/messages.js';
import type { AgentView } from '../views/agentViews.js';
import { shortPr } from './prRows.js';
import { recapHeadline } from './recapHeadline.js';

/**
 * The day told by work rather than by event: per project (the agent's
 * folder), per session, what it achieved — its newest recap from Claude Code
 * cut to what got done, else its last turn in a sentence, else its name —
 * then tasks, PRs and what it left you; on top, "Hoy": a line per project
 * with what its busiest sessions achieved. Sessions where nothing got done (a greeting, a
 * quick question) are set apart as "cortas" instead of filling the day.
 * Pure: built from today's history, the live agents and the PR statuses.
 */
export interface WorkStream {
  agent: string;
  /** What it achieved today, the card's headline (its recap, its last turn,
   *  or at least its name). */
  title: string;
  /** Its newest recap, cut to what got done. */
  recap?: string;
  recapAt?: number;
  agentId?: number;
  palette?: number;
  hueShift?: number;
  from: number;
  to: number;
  done: string[];
  /** What its turns did, one sentence each, newest first, without repeats. */
  did: string[];
  /** Files it edited or wrote. */
  edits: number;
  prs: Array<{ url: string; label: string; state?: PrStatus['state'] }>;
  /** What its turns left you ("te toca"), newest first, without repeats. */
  leftForYou: string[];
  turns: number;
  answered: number;
}

export interface DayStory {
  headline: string;
  span?: { from: number; to: number };
  projects: Array<{ name: string; streams: WorkStream[] }>;
  /** "Hoy": per project, what its busiest sessions achieved (up to 3). */
  today: Array<{ project: string; headlines: string[] }>;
  /** Sessions with nothing done (greetings, tests, a quick question). */
  minor: WorkStream[];
}

const NO_PROJECT = 'Sin carpeta';
const TODAY_SHOWN = 3;
const COMPLETED = /^Completó:\s*/;

const weight = (s: WorkStream) =>
  s.done.length * 3 +
  s.prs.length * 4 +
  s.turns +
  s.leftForYou.length +
  s.did.length +
  s.edits +
  (s.recap ? 5 : 0);

/** Something to tell: a recap of what it achieved, it changed files,
 *  finished tasks, opened a PR, left you something, or worked through more
 *  than one turn it could sum up. */
export function didSomething(s: WorkStream): boolean {
  return (
    s.recap !== undefined ||
    s.done.length > 0 ||
    s.prs.length > 0 ||
    s.edits > 0 ||
    s.leftForYou.length > 0 ||
    s.did.length > 1
  );
}

function streamFor(map: Map<string, WorkStream>, e: DayLogEntry, view?: AgentView): WorkStream {
  let s = map.get(e.agent);
  if (!s) {
    s = {
      agent: e.agent,
      title: e.agent,
      agentId: e.agentId,
      palette: view?.palette,
      hueShift: view?.hueShift,
      from: e.at,
      to: e.at,
      done: [],
      did: [],
      edits: 0,
      prs: [],
      leftForYou: [],
      turns: 0,
      answered: 0,
    };
    map.set(e.agent, s);
  }
  s.from = Math.min(s.from, e.at);
  s.to = Math.max(s.to, e.at);
  return s;
}

function addEntry(s: WorkStream, e: DayLogEntry, statuses: ReadonlyMap<string, PrStatus>): void {
  if (e.kind === 'tarea') s.done.push(e.text.replace(COMPLETED, ''));
  else if (e.kind === 'termino') {
    s.turns++;
    s.edits += e.edits ?? 0;
    if (e.summary && !s.did.includes(e.summary)) s.did.unshift(e.summary);
  } else if (e.kind === 'respuesta') s.answered++;
  else if (e.kind === 'tetoca' && !s.leftForYou.includes(e.text)) s.leftForYou.unshift(e.text);
  else if (e.kind === 'recap' && e.at >= (s.recapAt ?? -Infinity)) {
    // The newest recap says it all (the earlier ones are part of it).
    const recap = recapHeadline(e.text);
    if (recap) {
      s.recap = recap;
      s.recapAt = e.at;
    }
  }
  if (e.prUrl && !s.prs.some((p) => p.url === e.prUrl)) {
    const status = statuses.get(e.prUrl);
    s.prs.push({ url: e.prUrl, label: status?.title ?? shortPr(e.prUrl), state: status?.state });
  }
}

export function dayStory(
  entries: readonly DayLogEntry[],
  views: readonly AgentView[],
  statuses: ReadonlyMap<string, PrStatus>,
): DayStory {
  const byId = new Map(views.map((v) => [v.id, v]));
  const projectOf = new Map<string, string>();
  const streams = new Map<string, WorkStream>();
  // One card per session: its lines go under the newest name the office gave
  // it (a recap read from its transcript may carry another).
  const nameOf = new Map<string, string>();
  for (const e of entries) {
    if (e.sessionId && (e.kind !== 'recap' || !nameOf.has(e.sessionId))) {
      nameOf.set(e.sessionId, e.agent);
    }
  }
  for (const raw of entries) {
    const named = raw.sessionId ? nameOf.get(raw.sessionId) : undefined;
    const e = named && named !== raw.agent ? { ...raw, agent: named } : raw;
    const view = e.agentId !== undefined ? byId.get(e.agentId) : undefined;
    const s = streamFor(streams, e, view);
    // The folder the server recorded with the line, else the live agent's.
    const folder = e.folder ?? view?.folder;
    if (folder) projectOf.set(e.agent, folder);
    addEntry(s, e, statuses);
  }
  const projects = new Map<string, WorkStream[]>();
  const minor: WorkStream[] = [];
  for (const s of streams.values()) {
    s.title = s.recap ?? s.did[0] ?? s.agent;
    if (weight(s) === 0) continue;
    if (!didSomething(s)) {
      minor.push(s);
      continue;
    }
    const name = projectOf.get(s.agent) ?? NO_PROJECT;
    projects.set(name, [...(projects.get(name) ?? []), s]);
  }
  const list = [...projects.entries()]
    .map(([name, ss]) => ({ name, streams: ss.sort((a, b) => weight(b) - weight(a)) }))
    .sort(
      (a, b) =>
        b.streams.reduce((n, s) => n + weight(s), 0) - a.streams.reduce((n, s) => n + weight(s), 0),
    );
  const all = list.flatMap((p) => p.streams);
  const times = entries.map((e) => e.at);
  return {
    headline: headline(all, list.length),
    span: times.length > 0 ? { from: Math.min(...times), to: Math.max(...times) } : undefined,
    projects: list,
    today: list.flatMap((p) => {
      const headlines = [
        ...new Set(p.streams.filter((s) => s.title !== s.agent).map((s) => s.title)),
      ].slice(0, TODAY_SHOWN);
      return headlines.length > 0 ? [{ project: p.name, headlines }] : [];
    }),
    minor: minor.sort((a, b) => b.to - a.to),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "5 agentes en 3 proyectos · 14 tareas · 3 PRs (1 mergeado)". */
export function headline(streams: readonly WorkStream[], projects: number): string {
  if (streams.length === 0) return 'Todavía no se terminó nada hoy.';
  const tasks = streams.reduce((n, s) => n + s.done.length, 0);
  const prs = streams.flatMap((s) => s.prs);
  const merged = prs.filter((p) => p.state === 'merged').length;
  const parts = [
    `${plural(streams.length, 'agente', 'agentes')} en ${plural(projects, 'proyecto', 'proyectos')}`,
  ];
  if (tasks > 0) parts.push(plural(tasks, 'tarea', 'tareas'));
  if (prs.length > 0) {
    parts.push(
      `${plural(prs.length, 'PR', 'PRs')}${merged > 0 ? ` (${merged} ${merged === 1 ? 'mergeado' : 'mergeados'})` : ''}`,
    );
  }
  return parts.join(' · ');
}
