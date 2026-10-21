import type { DayLogEntry } from '../../../core/src/messages.js';
import { recapHeadline } from './recapHeadline.js';

/** Consecutive lines of the same kind for the same agent within this window
 *  collapse into one ("4 pedidos de permiso · 10:12–10:20"). */
const GROUP_WINDOW_MS = 10 * 60_000;

export interface DayLogRow {
  key: string;
  agentId?: number;
  agent: string;
  kind: DayLogEntry['kind'];
  text: string;
  from: number;
  to: number;
  count: number;
  prUrl?: string;
}

const PLURAL: Partial<Record<DayLogEntry['kind'], (n: number) => string>> = {
  permiso: (n) => `${n} pedidos de permiso`,
  respuesta: (n) => `${n} permisos contestados`,
  tarea: (n) => `${n} tareas completadas`,
  termino: (n) => `Terminó ${n} turnos`,
};

/** History rows, newest first, with bursts collapsed. */
export function dayLogRows(entries: DayLogEntry[]): DayLogRow[] {
  const rows: DayLogRow[] = [];
  for (const e of entries) {
    // A recap reads as what the session achieved so far (none: nothing to say).
    const recap = e.kind === 'recap' ? recapHeadline(e.text) : undefined;
    if (e.kind === 'recap' && !recap) continue;
    const last = rows[rows.length - 1];
    if (
      last &&
      last.agentId === e.agentId &&
      last.kind === e.kind &&
      e.kind !== 'tetoca' &&
      e.kind !== 'recap' &&
      e.at - last.to <= GROUP_WINDOW_MS
    ) {
      last.count++;
      last.to = e.at;
      last.text = PLURAL[e.kind]?.(last.count) ?? `${e.text} (×${last.count})`;
      continue;
    }
    rows.push({
      key: `${e.at}:${e.agentId ?? ''}:${e.kind}`,
      agentId: e.agentId,
      agent: e.agent,
      kind: e.kind,
      text: recap ? `Resumen: ${recap}` : e.text,
      from: e.at,
      to: e.at,
      count: 1,
      prUrl: e.prUrl,
    });
  }
  return rows.reverse();
}

/**
 * The day's achievements, from what the history recorded — results, never
 * speed or volume of approvals (that would push to approve without reading).
 */
export function dayAchievements(entries: DayLogEntry[]): string[] {
  const out: string[] = [];
  const tasks = entries.filter((e) => e.kind === 'tarea').length;
  if (tasks > 0) out.push(tasks === 1 ? '1 tarea completada' : `${tasks} tareas completadas`);
  const prs = new Set(entries.filter((e) => e.kind === 'tetoca' && e.prUrl).map((e) => e.prUrl));
  if (prs.size > 0) out.push(prs.size === 1 ? '1 PR para revisar' : `${prs.size} PRs para revisar`);
  const waits = entries.filter((e) => e.kind === 'respuesta' && e.waitedMs !== undefined);
  if (waits.length >= 3 && waits.every((e) => e.waitedMs! <= GROUP_WINDOW_MS)) {
    out.push('Nadie esperó más de 10 min un permiso');
  }
  return out;
}

/** "10:12" or "10:12–10:20". */
export function timeRange(from: number, to: number): string {
  const hm = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return from === to || hm(from) === hm(to) ? hm(from) : `${hm(from)}–${hm(to)}`;
}

export interface DaySummary {
  tasks: number;
  turns: number;
  prs: number;
  /** PRs merged today (distinct). */
  merged: number;
  answered: number;
  /** Whoever finished the most (tasks and turns), when anyone did. */
  star?: { agent: string; agentId?: number; count: number };
}

/** The day in numbers, for the evening summary. */
export function daySummary(entries: DayLogEntry[]): DaySummary {
  const tally = new Map<string, { agent: string; agentId?: number; count: number }>();
  for (const e of entries) {
    if (e.kind !== 'tarea' && e.kind !== 'termino') continue;
    const t = tally.get(e.agent) ?? { agent: e.agent, agentId: e.agentId, count: 0 };
    t.count++;
    tally.set(e.agent, t);
  }
  const star = [...tally.values()].sort((a, b) => b.count - a.count)[0];
  return {
    tasks: entries.filter((e) => e.kind === 'tarea').length,
    turns: entries.filter((e) => e.kind === 'termino').length,
    prs: new Set(entries.filter((e) => e.prUrl).map((e) => e.prUrl)).size,
    merged: new Set(entries.filter((e) => e.kind === 'mergeado').map((e) => e.prUrl ?? e.text))
      .size,
    answered: entries.filter((e) => e.kind === 'respuesta').length,
    star,
  };
}

/** "12 tareas · 30 turnos · 3 PRs": only what happened. */
export function summaryLine(s: DaySummary): string {
  const parts: string[] = [];
  if (s.tasks > 0) parts.push(s.tasks === 1 ? '1 tarea' : `${s.tasks} tareas`);
  if (s.turns > 0) parts.push(s.turns === 1 ? '1 turno terminado' : `${s.turns} turnos terminados`);
  if (s.prs > 0) parts.push(s.prs === 1 ? '1 PR' : `${s.prs} PRs`);
  if (s.answered > 0) parts.push(s.answered === 1 ? '1 permiso' : `${s.answered} permisos`);
  return parts.join(' · ');
}
