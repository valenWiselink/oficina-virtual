import { isWorkday } from './workdays.js';

/**
 * The streak: working days in a row you closed with an empty "Te necesita"
 * (seen empty after 17 h, with some work done). A weekend or a fixed holiday
 * does not break it (a clean one still counts). Pure, so it is tested
 * without a DOM.
 */

/** The day counts for the streak from this hour. */
export const CLOSING_HOUR = 17;

/** Whether today earns its place in the streak right now. */
export function closesClean(hour: number, finishedToday: number, needingYou: number): boolean {
  return hour >= CLOSING_HOUR && finishedToday > 0 && needingYou === 0;
}

/** Days looked back at most (the memory keeps 60). */
const LOOK_BACK_DAYS = 60;

/**
 * Consecutive clean days ending today (or the day before, while today is
 * still open), from the list of clean day numbers: a day off that was not
 * clean is skipped, a working day that was not clean ends it.
 */
export function streakLength(
  cleanDays: readonly number[],
  today: number,
  workday: (day: number) => boolean = isWorkday,
): number {
  const set = new Set(cleanDays);
  let n = 0;
  for (let day = set.has(today) ? today : today - 1; day > today - LOOK_BACK_DAYS; day--) {
    if (set.has(day)) n++;
    else if (workday(day)) break;
  }
  return n;
}
