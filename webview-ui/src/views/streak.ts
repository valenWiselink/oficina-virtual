/**
 * The streak: days in a row you closed with an empty "Te necesita" (seen
 * empty after 17 h, with some work done). Pure, so it is tested without a DOM.
 */

/** The day counts for the streak from this hour. */
export const CLOSING_HOUR = 17;

/** Whether today earns its place in the streak right now. */
export function closesClean(hour: number, finishedToday: number, needingYou: number): boolean {
  return hour >= CLOSING_HOUR && finishedToday > 0 && needingYou === 0;
}

/**
 * Consecutive clean days ending today (or yesterday, while today is still
 * open), from the list of clean day numbers.
 */
export function streakLength(cleanDays: readonly number[], today: number): number {
  const set = new Set(cleanDays);
  let day = set.has(today) ? today : today - 1;
  let n = 0;
  while (set.has(day)) {
    n++;
    day--;
  }
  return n;
}
