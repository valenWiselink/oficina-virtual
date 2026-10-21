/**
 * «Así fue tu semana»: the Friday summary (or Monday's, when Friday's was
 * missed) from the server's week numbers. Only what got done — merges,
 * tasks, turns — never approvals or speed, and never a comparison down.
 * Pure, so it is tested without a DOM.
 */

import type { WeekRecap } from '../../../core/src/messages.js';
import { SUMMARY_HOUR } from './cheerText.js';
import { mondayOf, weekdayOf } from './workdays.js';

/** A week with fewer days of work than this has no summary. */
export const MIN_WORKED_DAYS = 2;

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
export const DAY_INITIALS = ['L', 'M', 'M', 'J', 'V'];

export interface WeekCheer {
  title: string;
  text: string;
  closing: string;
  /** Each day's share of the busiest one, 0..1, Monday to Friday. */
  bars: number[];
}

const score = (d: WeekRecap['days'][number]) => d.tasks + d.turns + d.merged;

/** Which week to sum up now (its Monday), if any: this one on Friday from
 *  the summary hour, last one on Monday — unless already seen. */
export function weekToShow(
  today: number,
  hour: number,
  seenMonday: number | undefined,
): number | undefined {
  const weekday = weekdayOf(today);
  const monday =
    weekday === 5 && hour >= SUMMARY_HOUR
      ? mondayOf(today)
      : weekday === 1
        ? mondayOf(today) - 7
        : undefined;
  return monday === undefined || monday === seenMonday ? undefined : monday;
}

export function weekCheer(recap: WeekRecap, name: string, late: boolean): WeekCheer | null {
  const days = recap.days.slice(0, 5);
  const worked = days.filter((d) => score(d) > 0);
  if (worked.length < MIN_WORKED_DAYS) return null;
  const sum = (pick: (d: WeekRecap['days'][number]) => number) =>
    days.reduce((n, d) => n + pick(d), 0);
  const merged = sum((d) => d.merged);
  const tasks = sum((d) => d.tasks);
  const turns = sum((d) => d.turns);
  const parts: string[] = [];
  if (merged > 0) parts.push(merged === 1 ? '1 PR mergeado' : `${merged} PRs mergeados`);
  if (tasks > 0) parts.push(tasks === 1 ? '1 tarea' : `${tasks} tareas`);
  else if (turns > 0) parts.push(turns === 1 ? '1 turno' : `${turns} turnos`);
  const top = Math.max(...days.map(score));
  const busiest = days.findIndex((d) => score(d) === top);
  parts.push(`el ${DAY_NAMES[busiest]} fue el más movido`);
  const who = name ? `, ${name}` : '';
  return {
    title: late ? 'Así fue la semana pasada' : 'Así fue tu semana',
    text: parts.join(' · '),
    closing: late ? `¡Buena semana${who}!` : `¡Buen finde${who}!`,
    bars: days.map((d) => score(d) / top),
  };
}
