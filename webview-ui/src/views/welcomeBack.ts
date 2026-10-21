/**
 * «Volviste»: what happened while you were away, in one line for the board's
 * greeting — who left you something first, then who finished, the merges
 * and a "Terminaron todos" you did not see. Built only from today's history
 * (and the moments the office noted), never from guesses. Pure.
 */

import { joinWithY } from '../focus/focusMode.js';

export interface AwaySummary {
  /** Names of the agents that left you something ("te toca"), in order. */
  leftYou: string[];
  /** How many agents finished a turn or a task. */
  finished: number;
  /** PRs merged (distinct). */
  merged: number;
  /** "Terminaron todos" happened at some point. */
  allDone: boolean;
  /** The agents that finished or left you something (the graph may wave). */
  agentIds: number[];
}

type Entry = { at: number; kind: string; agent: string; agentId?: number; prUrl?: string };

/** What the history says about [from, to], or null when nothing happened. */
export function awaySummary(
  entries: readonly Entry[],
  from: number,
  to: number,
  allDone: boolean,
): AwaySummary | null {
  const within = entries.filter((e) => e.at >= from && e.at <= to);
  const leftYou = unique(within.filter((e) => e.kind === 'tetoca').map((e) => e.agent));
  const finishers = within.filter((e) => e.kind === 'termino' || e.kind === 'tarea');
  const finished = unique(finishers.map((e) => e.agentId ?? e.agent)).length;
  const merged = unique(
    within.filter((e) => e.kind === 'mergeado').map((e) => e.prUrl ?? String(e.at)),
  ).length;
  if (leftYou.length === 0 && finished === 0 && merged === 0 && !allDone) return null;
  const agentIds = unique(
    within
      .filter((e) => e.kind === 'tetoca' || e.kind === 'termino' || e.kind === 'tarea')
      .flatMap((e) => (e.agentId === undefined ? [] : [e.agentId])),
  );
  return { leftYou, finished, merged, allDone, agentIds };
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Lunch hours: «¿Qué tal el almuerzo?» instead of «Volviste». */
const LUNCH_FROM = 13;
const LUNCH_UNTIL = 15;

/** «Volviste, Valentín» and «mientras tanto: Langostino te dejó algo, 4
 *  terminaron y se mergeó 1 PR». */
export function welcomeLine(
  s: AwaySummary,
  name: string,
  hour: number,
): { title: string; text: string } {
  const lunch = hour >= LUNCH_FROM && hour < LUNCH_UNTIL;
  const who = name ? `, ${name}` : '';
  const title = lunch ? `¿Qué tal el almuerzo${who}?` : `Volviste${who}`;
  const parts: string[] = [];
  if (s.leftYou.length === 1) parts.push(`${s.leftYou[0]} te dejó algo`);
  else if (s.leftYou.length === 2) parts.push(`${s.leftYou.join(' y ')} te dejaron algo`);
  else if (s.leftYou.length > 2) parts.push(`${s.leftYou.length} te dejaron algo`);
  if (s.allDone) parts.push('terminaron todos');
  else if (s.finished > 0) parts.push(s.finished === 1 ? '1 terminó' : `${s.finished} terminaron`);
  if (s.merged > 0) parts.push(s.merged === 1 ? 'se mergeó 1 PR' : `se mergearon ${s.merged} PRs`);
  return { title, text: `mientras tanto: ${joinWithY(parts)}` };
}
