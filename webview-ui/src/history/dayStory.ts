import type { DayLogEntry, PrStatus } from '../../../core/src/messages.js';
import type { AgentView } from '../views/agentViews.js';
import { shortPr } from './prRows.js';

/**
 * The day told by work rather than by event: per project (the agent's
 * folder), per agent, what got done (tasks completed, PRs and their fate),
 * what it left you and when it worked — plus one headline for the whole day.
 * Pure: built from today's history, the live agents and the PR statuses.
 */
export interface WorkStream {
  agent: string;
  agentId?: number;
  palette?: number;
  hueShift?: number;
  from: number;
  to: number;
  done: string[];
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
}

const NO_PROJECT = 'Sin carpeta';
const COMPLETED = /^Completó:\s*/;

const weight = (s: WorkStream) =>
  s.done.length * 3 + s.prs.length * 4 + s.turns + s.leftForYou.length;

function streamFor(map: Map<string, WorkStream>, e: DayLogEntry, view?: AgentView): WorkStream {
  let s = map.get(e.agent);
  if (!s) {
    s = {
      agent: e.agent,
      agentId: e.agentId,
      palette: view?.palette,
      hueShift: view?.hueShift,
      from: e.at,
      to: e.at,
      done: [],
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
  else if (e.kind === 'termino') s.turns++;
  else if (e.kind === 'respuesta') s.answered++;
  else if (e.kind === 'tetoca' && !s.leftForYou.includes(e.text)) s.leftForYou.unshift(e.text);
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
  for (const e of entries) {
    const view = e.agentId !== undefined ? byId.get(e.agentId) : undefined;
    const s = streamFor(streams, e, view);
    // The folder the server recorded with the line, else the live agent's.
    const folder = e.folder ?? view?.folder;
    if (folder) projectOf.set(e.agent, folder);
    addEntry(s, e, statuses);
  }
  const projects = new Map<string, WorkStream[]>();
  for (const s of streams.values()) {
    if (weight(s) === 0) continue;
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
  return {
    headline: headline(all, list.length),
    span:
      entries.length > 0 ? { from: entries[0].at, to: entries[entries.length - 1].at } : undefined,
    projects: list,
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
