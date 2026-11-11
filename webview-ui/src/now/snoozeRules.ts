/**
 * «Posponer» with times that make sense (asked 2026-11-11: «no quiero
 * hacerlo ahora ni que me lo recuerde en una hora»): after the meeting the
 * ask names, after the next meeting today, tomorrow morning, Monday, or a
 * day and time picked by hand. One hour stays, last, for what is just busy.
 */
import { meetingNamed, type MeetingTime, MORNING_HOUR, whenText } from './nowTime.js';

export interface SnoozeChoice {
  label: string;
  /** When it comes back (ms). */
  until: number;
  /** «jue 11:00», «mañana 9:00». */
  when: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONDAY = 1;
const SATURDAY = 6;
const SUNDAY = 0;

const midnight = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const morningOf = (day: number): number => {
  const d = new Date(day);
  d.setHours(MORNING_HOUR, 0, 0, 0);
  return d.getTime();
};

/** The next working morning: tomorrow, or Monday after a Friday. */
function nextWorkingMorning(now: number): { at: number; label: string } {
  let day = midnight(now) + DAY;
  const weekday = () => new Date(day).getDay();
  if (weekday() === SATURDAY) day += 2 * DAY;
  else if (weekday() === SUNDAY) day += DAY;
  const label = day === midnight(now) + DAY ? 'Mañana a la mañana' : 'El lunes a la mañana';
  return { at: morningOf(day), label };
}

/** The meeting the ask's words name («después de la demo»), if it is still ahead. */
function namedMeeting(
  text: string,
  after: string | undefined,
  meetings: readonly MeetingTime[],
  now: number,
): MeetingTime | undefined {
  if (after) return meetingNamed(after, meetings, now);
  const word =
    /\b(?:después de|apenas termine|cuando termine|al terminar)\s+(?:la|el)\s+([a-záéíóúñ]{3,})/i.exec(
      text,
    )?.[1];
  return word ? meetingNamed(word, meetings, now) : undefined;
}

export function snoozeChoices(
  ask: { text: string; after?: string },
  now: number,
  meetings: readonly MeetingTime[] = [],
): SnoozeChoice[] {
  const choices: SnoozeChoice[] = [];
  const add = (label: string, until: number) => {
    if (until <= now || choices.some((c) => Math.abs(c.until - until) < 15 * 60_000)) return;
    choices.push({ label, until, when: whenText(until, now) });
  };
  const named = namedMeeting(ask.text, ask.after, meetings, now);
  if (named) add(`Después de ${named.title}`, named.end);
  const today = meetings
    .filter((m) => m.start > now && midnight(m.start) === midnight(now))
    .sort((a, b) => a.start - b.start)[0];
  if (today) add(`Al terminar ${today.title}`, today.end);
  const morning = nextWorkingMorning(now);
  add(morning.label, morning.at);
  const monday = midnight(now) + ((MONDAY - new Date(now).getDay() + 7) % 7 || 7) * DAY;
  add('El lunes', morningOf(monday));
  add('En una hora', now + HOUR);
  return choices;
}

/** A day and time typed in the picker (`2026-11-12T11:00`), as ms; undefined if it is not ahead. */
export function pickedTime(value: string, now: number): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return undefined;
  const at = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  return at > now ? at : undefined;
}
