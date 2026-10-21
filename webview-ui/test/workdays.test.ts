import { describe, expect, it } from 'vitest';

import type { WeekRecap } from '../../core/src/messages.js';
import { localDay } from '../src/views/boardMood.js';
import { weekCheer, weekToShow } from '../src/views/weekText.js';
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

describe('the week’s summary', () => {
  const recap = (scores: Array<[number, number, number]>): WeekRecap => ({
    type: 'weekRecap',
    monday: '2026-10-19',
    days: scores.map(([tasks, turns, merged], i) => ({
      day: `2026-10-${19 + i}`,
      tasks,
      turns,
      merged,
    })),
  });

  it('shows on Friday from 18 h, or on Monday for the week before, once', () => {
    const friday = day(2026, 10, 23);
    const monday = day(2026, 10, 19);
    expect(weekToShow(friday, 17, undefined)).toBeUndefined();
    expect(weekToShow(friday, 18, undefined)).toBe(monday);
    expect(weekToShow(friday, 19, monday)).toBeUndefined();
    expect(weekToShow(day(2026, 10, 26), 9, undefined)).toBe(monday);
    expect(weekToShow(day(2026, 10, 26), 9, monday)).toBeUndefined();
    expect(weekToShow(day(2026, 10, 21), 19, undefined)).toBeUndefined();
  });

  it('sums what got done and names the busiest day', () => {
    const w = weekCheer(
      recap([
        [10, 30, 2],
        [20, 50, 5],
        [8, 20, 3],
        [6, 10, 2],
        [4, 12, 2],
      ]),
      'Valentín',
      false,
    )!;
    expect(w.title).toBe('Así fue tu semana');
    expect(w.text).toBe('14 PRs mergeados · 48 tareas · el martes fue el más movido');
    expect(w.closing).toBe('¡Buen finde, Valentín!');
    expect(w.bars[1]).toBe(1);
    expect(w.bars).toHaveLength(5);
  });

  it('stays quiet with fewer than 2 days of work, and says "pasada" on Monday', () => {
    expect(
      weekCheer(
        recap([
          [3, 4, 0],
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ]),
        '',
        false,
      ),
    ).toBeNull();
    const late = weekCheer(
      recap([
        [0, 4, 0],
        [0, 2, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
      '',
      true,
    )!;
    expect(late.title).toBe('Así fue la semana pasada');
    expect(late.text).toBe('6 turnos · el lunes fue el más movido');
    expect(late.closing).toBe('¡Buena semana!');
  });
});
