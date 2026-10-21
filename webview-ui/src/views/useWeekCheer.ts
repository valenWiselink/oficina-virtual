import { useEffect, useRef } from 'react';

import { useWeekRecap } from '../history/weekRecapStore.js';
import { localDay } from './boardMood.js';
import { useOperatorName } from './officeMemory.js';
import { type WeekCheer, weekCheer, weekToShow } from './weekText.js';
import { isoDay, weekdayOf } from './workdays.js';

const WEEK_KEY = 'oficina.semana';

/**
 * «Así fue tu semana» (OfficeCheers): on Friday from 18 h, or on a Monday
 * that missed it, the week's numbers from the server's histories — once a
 * week, never in calm mode, and only once nothing else is on screen
 * (`busy`). Returns whether the day's summary should wait for it (the
 * answer is on its way); a week with too little work leaves it to the day.
 */
export function useWeekCheer(opts: {
  calm: boolean;
  busy: boolean;
  now: number;
  onShow: (week: WeekCheer, friday: boolean) => void;
}): boolean {
  const date = new Date(opts.now);
  const day = localDay(date);
  const monday = opts.calm ? undefined : weekToShow(day, date.getHours(), readWeekSeen());
  const week = useWeekRecap(monday === undefined ? undefined : isoDay(monday));
  const name = useOperatorName();
  const onShow = useRef(opts.onShow);
  onShow.current = opts.onShow;
  useEffect(() => {
    if (opts.busy || monday === undefined || week === undefined) return;
    writeWeekSeen(monday);
    const friday = weekdayOf(day) === 5;
    const summary = week && weekCheer(week, name, !friday);
    if (summary) onShow.current(summary, friday);
  }, [week, monday, opts.busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return monday !== undefined && week === undefined;
}

function readWeekSeen(): number | undefined {
  try {
    const raw = localStorage.getItem(WEEK_KEY);
    return raw === null ? undefined : Number(raw);
  } catch {
    return undefined;
  }
}

function writeWeekSeen(monday: number): void {
  try {
    localStorage.setItem(WEEK_KEY, String(monday));
  } catch {
    /* blocked storage: it may show again on reload */
  }
}
