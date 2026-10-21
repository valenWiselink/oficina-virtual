import { useEffect, useSyncExternalStore } from 'react';

import type { DaySummary } from '../history/dayLogView.js';

/**
 * What the office remembers across days, in this browser: your name for the
 * greeting, a summary per day (so the morning can recall yesterday) and the
 * days you closed clean (the streak).
 */
const NAME_KEY = 'oficina.nombre';
const DAYS_KEY = 'oficina.dias';
const CLEAN_KEY = 'oficina.racha';
/** Days of summaries and clean days kept. */
const KEEP_DAYS = 60;

export interface DayRecord {
  tasks: number;
  turns: number;
  /** PR links it left you (a "te toca"). */
  prs: number;
  /** PRs merged (kept since 2026-10-21; older days lack it). */
  merged?: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* blocked storage: it lasts this tab */
  }
}

let name = read<string>(NAME_KEY, '');
const listeners = new Set<() => void>();

export function setOperatorName(next: string): void {
  name = next.trim().slice(0, 40);
  write(NAME_KEY, name);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Your name for the greeting ("" when not set). */
export function useOperatorName(): string {
  return useSyncExternalStore(subscribe, () => name);
}

/** A past day's record, if this browser saw it. */
export function dayRecord(day: number): DayRecord | undefined {
  return dayRecords()[String(day)];
}

/** Every day this browser kept (the last 60), by day number. */
export function dayRecords(): Record<string, DayRecord> {
  return read<Record<string, DayRecord>>(DAYS_KEY, {});
}

/** Keep today's numbers (called as they change). */
export function useRememberDay(day: number, summary: DaySummary): void {
  const { tasks, turns, prs, merged } = summary;
  useEffect(() => {
    if (tasks + turns + prs === 0) return;
    const days = read<Record<string, DayRecord>>(DAYS_KEY, {});
    days[String(day)] = { tasks, turns, prs, merged };
    const kept = Object.keys(days)
      .map(Number)
      .filter((d) => d > day - KEEP_DAYS);
    write(DAYS_KEY, Object.fromEntries(kept.map((d) => [String(d), days[String(d)]])));
  }, [day, tasks, turns, prs, merged]);
}

export function cleanDays(): number[] {
  return read<number[]>(CLEAN_KEY, []);
}

export function markCleanDay(day: number): void {
  const days = cleanDays();
  if (days.includes(day)) return;
  write(
    CLEAN_KEY,
    [...days, day].filter((d) => d > day - KEEP_DAYS),
  );
  for (const l of listeners) l();
}

/** "ayer: 12 tareas y 3 PRs" for the morning greeting. */
export function yesterdayLine(record: DayRecord | undefined): string | undefined {
  const parts = recallParts(record);
  return parts ? `ayer: ${parts}` : undefined;
}

/** "12 tareas y 3 PRs mergeados": what a day left, merges over PRs asked
 *  for when it has them (only what got done). */
export function recallParts(record: DayRecord | undefined): string | undefined {
  if (!record) return undefined;
  const parts: string[] = [];
  if (record.tasks > 0) parts.push(record.tasks === 1 ? '1 tarea' : `${record.tasks} tareas`);
  if (record.turns > 0 && record.tasks === 0) {
    parts.push(record.turns === 1 ? '1 turno terminado' : `${record.turns} turnos terminados`);
  }
  const merged = record.merged ?? 0;
  if (merged > 0) parts.push(merged === 1 ? '1 PR mergeado' : `${merged} PRs mergeados`);
  else if (record.prs > 0) parts.push(record.prs === 1 ? '1 PR' : `${record.prs} PRs`);
  return parts.length > 0 ? parts.join(' y ') : undefined;
}
