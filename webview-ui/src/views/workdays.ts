/**
 * Working days, for the office's memory of the week: the streak does not
 * break on a weekend or a fixed holiday, and Monday's "ayer" is Friday.
 * Days are the board's numbers (days since the epoch in local time,
 * boardMood.localDay), so a day's calendar date is read in UTC. Pure.
 */

/** Argentina's fixed-date holidays (month-day). Movable ones are left out,
 *  as in boardMood: a wrong holiday is worse than none. */
const FIXED_HOLIDAYS: ReadonlySet<string> = new Set([
  '01-01',
  '03-24',
  '04-02',
  '05-01',
  '05-25',
  '06-20',
  '07-09',
  '12-08',
  '12-25',
]);

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const MS_PER_DAY = 86_400_000;

/** The calendar date of a board day, as a UTC date. */
function dateOf(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: number): number {
  return dateOf(day).getUTCDay();
}

export function isWorkday(day: number): boolean {
  const date = dateOf(day);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const md = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return !FIXED_HOLIDAYS.has(md);
}

/** "ayer", or "el viernes" when the last day worked was further back. */
export function dayLabel(day: number, today: number): string {
  return day === today - 1 ? 'ayer' : `el ${WEEKDAYS[weekdayOf(day)]}`;
}

/** The weekday's name ("lunes"), for the week's summary. */
export function weekdayName(day: number): string {
  return WEEKDAYS[weekdayOf(day)];
}

/** How far back "the last day you worked" is looked for: a long weekend
 *  (Friday to a Tuesday after a holiday Monday) fits. */
export const RECALL_DAYS = 5;

/** The latest day before `today` that has something (`has`), within
 *  RECALL_DAYS: Monday's is Friday. */
export function lastWorkedDay(today: number, has: (day: number) => boolean): number | undefined {
  for (let day = today - 1; day >= today - RECALL_DAYS; day--) if (has(day)) return day;
  return undefined;
}

/** The Monday of a day's week (a Sunday belongs to the week before it). */
export function mondayOf(day: number): number {
  return day - ((weekdayOf(day) + 6) % 7);
}

/** AAAA-MM-DD of a board day (the server's history file names). */
export function isoDay(day: number): string {
  return dateOf(day).toISOString().slice(0, 10);
}
