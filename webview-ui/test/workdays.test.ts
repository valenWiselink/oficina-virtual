import { describe, expect, it } from 'vitest';

import { localDay } from '../src/views/boardMood.js';
import {
  dayLabel,
  isoDay,
  isWorkday,
  lastWorkedDay,
  mondayOf,
  weekdayName,
} from '../src/views/workdays.js';

/** A board day from a local calendar date. */
const day = (y: number, m: number, d: number) => localDay(new Date(y, m - 1, d, 10));

describe('workdays', () => {
  it('knows weekends and fixed holidays', () => {
    expect(isWorkday(day(2026, 10, 23))).toBe(true); // Friday
    expect(isWorkday(day(2026, 10, 24))).toBe(false); // Saturday
    expect(isWorkday(day(2026, 10, 25))).toBe(false); // Sunday
    expect(isWorkday(day(2026, 12, 8))).toBe(false); // Tuesday, holiday
    expect(isWorkday(day(2026, 5, 25))).toBe(false); // Monday, holiday
  });

  it('names the day by its calendar date', () => {
    expect(weekdayName(day(2026, 10, 21))).toBe('miércoles');
    expect(isoDay(day(2026, 10, 21))).toBe('2026-10-21');
    expect(mondayOf(day(2026, 10, 21))).toBe(day(2026, 10, 19));
    expect(mondayOf(day(2026, 10, 25))).toBe(day(2026, 10, 19)); // Sunday: the week before
    expect(mondayOf(day(2026, 10, 19))).toBe(day(2026, 10, 19));
  });

  it('finds the last day worked: Monday’s is Friday', () => {
    const monday = day(2026, 10, 26);
    const friday = day(2026, 10, 23);
    const has = (d: number) => d === friday;
    expect(lastWorkedDay(monday, has)).toBe(friday);
    expect(dayLabel(friday, monday)).toBe('el viernes');
    expect(dayLabel(monday - 1, monday)).toBe('ayer');
    expect(lastWorkedDay(monday, () => false)).toBeUndefined();
  });
});
