/**
 * The board's greeting line, decided in one place: several things want to
 * say something there, and only one does. Pure, so the rule is tested.
 *
 * The whole line:
 *   1. «Volviste» (welcomeBack.ts) — after an absence, for 3 min: what
 *      happened while you were away, starting with who waits.
 *   2. Otherwise «Buen día, Valentín · <note> · <summary>».
 *
 * The note, first that applies:
 *   1. «día movido: de a uno, sin apuro» — 4 or more wait on you now.
 *   2. A dated day (a holiday, Programmers' Day).
 *   3. Late at night.
 *   4. Monday morning: «lunes: arrancamos · el viernes cerraste con …».
 *   5. A morning after your best day of the month: «ayer: … · tu mejor día
 *      del mes» (rare, so it beats the weekday lines).
 *   6. Month end, Friday.
 *   7. Any other morning: «ayer: 12 tareas y 3 PRs».
 */

import type { BoardColumnId, DayMoments } from './boardMood.js';
import { greeting, MONDAY_NOTE, officeSummary } from './boardMood.js';
import { type DayRecord, recallParts } from './officeMemory.js';
import { dayLabel, lastWorkedDay } from './workdays.js';

/** From this many waiting at once the office says to take them one by one. */
export const BUSY_DAY_WAITING = 4;
export const BUSY_DAY_NOTE = 'día movido: de a uno, sin apuro';
/** «tu mejor día del mes» needs this many days remembered, within MONTH_DAYS. */
export const BEST_MIN_DAYS = 10;
const MONTH_DAYS = 30;
/** The morning recall shows until noon. */
const MORNING_UNTIL = 12;

/**
 * Whether `day` beat every remembered day of the 30 before it in tasks or
 * in merges (strictly, and above zero) — only with enough days to compare.
 */
export function isBestOfMonth(records: Readonly<Record<string, DayRecord>>, day: number): boolean {
  const record = records[String(day)];
  if (!record) return false;
  const others = Object.entries(records)
    .map(([d, r]) => [Number(d), r] as const)
    .filter(([d]) => d < day && d > day - MONTH_DAYS);
  if (others.length + 1 < BEST_MIN_DAYS) return false;
  const beats = (pick: (r: DayRecord) => number) =>
    pick(record) > 0 && others.every(([, r]) => pick(r) < pick(record));
  return beats((r) => r.tasks) || beats((r) => r.merged ?? 0);
}

export interface NoteInput {
  hour: number;
  today: number;
  moments: DayMoments;
  /** Waiting on you right now (the board on screen). */
  waiting: number;
  records: Readonly<Record<string, DayRecord>>;
}

/** The accent part of the greeting (see the order above), or nothing. */
export function greetingNote(input: NoteInput): string | undefined {
  const { hour, today, moments, waiting, records } = input;
  if (waiting >= BUSY_DAY_WAITING) return BUSY_DAY_NOTE;
  if (moments.special) return moments.special;
  if (moments.late) return moments.late;
  const worked = lastWorkedDay(today, (d) => records[String(d)] !== undefined);
  const recall = worked === undefined ? undefined : recallParts(records[String(worked)]);
  const best = worked !== undefined && isBestOfMonth(records, worked);
  const bestTail = best ? ' · tu mejor día del mes' : '';
  if (moments.monday) {
    return recall
      ? `${MONDAY_NOTE} · ${dayLabel(worked!, today)} cerraste con ${recall}${bestTail}`
      : MONDAY_NOTE;
  }
  const morning = hour < MORNING_UNTIL && recall !== undefined;
  const recallLine = morning ? `${dayLabel(worked!, today)}: ${recall}${bestTail}` : undefined;
  if (best && recallLine) return recallLine;
  return moments.plain ?? recallLine;
}

/** What «Volviste» has to say (welcomeBack.ts), when it is on. */
export interface WelcomeLine {
  title: string;
  text: string;
}

export interface GreetingLine {
  icon: string;
  title: string;
  note?: string;
  /** The office at a glance (not on «Volviste», which says its own). */
  summary?: string;
  welcome: boolean;
}

/** The whole line: «Volviste» while it lasts, else the greeting. */
export function boardGreeting(
  input: NoteInput & {
    name: string;
    counts: Record<BoardColumnId, number>;
    welcome?: WelcomeLine | null;
  },
): GreetingLine {
  const hello = greeting(input.hour);
  if (input.welcome) {
    return {
      icon: 'waving_hand',
      title: input.welcome.title,
      note: input.welcome.text,
      welcome: true,
    };
  }
  return {
    icon: hello.icon,
    title: input.name ? `${hello.text}, ${input.name}` : hello.text,
    note: greetingNote(input),
    summary: officeSummary(input.counts),
    welcome: false,
  };
}
