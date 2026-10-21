/**
 * A working week in numbers, Monday to Friday, read from the saved histories
 * (`historial-AAAA-MM-DD.jsonl`, dayLog.ts) rather than the page's own memory:
 * the desktop app and a browser tab each remember only what they saw, the
 * server saw it all. Only what got done counts — tasks completed, turns
 * finished, PRs merged — never approvals or speed.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { DayLogEntry, WeekRecap, WeekRecapDay } from '../../core/src/messages.js';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WORKDAYS = 5;

/** The week starting on `monday` (AAAA-MM-DD), or null for anything that is
 *  not a real date — it names files, so nothing else gets through. */
export function weekRecap(dir: string, monday: unknown): WeekRecap | null {
  const start = parseDay(monday);
  if (!start) return null;
  const days: WeekRecapDay[] = [];
  for (let i = 0; i < WORKDAYS; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const day = formatDay(date);
    days.push({ day, ...tally(readHistory(path.join(dir, `historial-${day}.jsonl`))) });
  }
  return { type: 'weekRecap', monday: formatDay(start), days };
}

/** One day's numbers from its history lines. */
export function tally(entries: readonly DayLogEntry[]): Omit<WeekRecapDay, 'day'> {
  const merged = new Set<string>();
  let tasks = 0;
  let turns = 0;
  for (const e of entries) {
    if (e.kind === 'tarea') tasks++;
    else if (e.kind === 'termino') turns++;
    else if (e.kind === 'mergeado') merged.add(e.prUrl ?? e.text);
  }
  return { tasks, turns, merged: merged.size };
}

function readHistory(file: string): DayLogEntry[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DayLogEntry];
      } catch {
        return [];
      }
    });
}

function parseDay(value: unknown): Date | null {
  const m = typeof value === 'string' ? DATE.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return formatDay(date) === value ? date : null;
}

function formatDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
