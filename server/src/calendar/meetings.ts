import type { Meeting } from '../../../core/src/messages.js';

/** What the page gets at most (the panel scrolls; a week rarely has more). */
const MEETINGS_MAX = 15;
const TITLE_MAX = 160;
export const UNTITLED_MEETING = '(sin título)';
/** From this long it is a block of the day, not a meeting to be at. */
const BLOCK_MS = 4 * 3_600_000;

/** Not meetings, though the connector lists them next to the ones that are. */
const NOT_MEETINGS = new Set(['OUT_OF_OFFICE', 'FOCUS_TIME', 'WORKING_LOCATION', 'BIRTHDAY']);

type Fields = Record<string, unknown>;

const fields = (v: unknown): Fields =>
  v !== null && typeof v === 'object' ? (v as Fields) : ({} as Fields);

/** An https link, or nothing: the page opens this on a click. */
function safeLink(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const url = new URL(v.trim());
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Google's own meeting link first; a location that is just a link, else. */
function joinLink(event: Fields): string | undefined {
  const video = fields(fields(event.conferenceData).videoEntryPoint).uri;
  return (
    safeLink(event.conferenceUrl) ??
    safeLink(event.hangoutLink) ??
    safeLink(video) ??
    safeLink(event.location)
  );
}

function myAnswer(event: Fields): unknown {
  if (!Array.isArray(event.attendees)) return undefined;
  return event.attendees.map(fields).find((a) => a.self === true)?.responseStatus;
}

/** Nobody but you is in it. */
function alone(event: Fields): boolean {
  return (
    !Array.isArray(event.attendees) || !event.attendees.map(fields).some((a) => a.self !== true)
  );
}

/**
 * On the calendar, yet nothing says you should be there: time marked free, an
 * invitation you did not accept, a reminder just for you with no link, a block
 * of many hours (a fair, a trip). Listed like the rest; the office never paints
 * the screen or announces these.
 */
function isQuiet(event: Fields, length: number, joinUrl: string | undefined): boolean {
  const answer = myAnswer(event);
  return (
    event.transparency === 'transparent' ||
    answer === 'tentative' ||
    answer === 'needsAction' ||
    length >= BLOCK_MS ||
    (alone(event) && !joinUrl)
  );
}

/**
 * The connector's events as the panel's meetings, soonest first: only what
 * the panel shows crosses to the page (no attendees, no description). Gone:
 * what is cancelled, declined or already over, whole-day events and what is
 * not a meeting (focus time, out of office).
 */
export function toMeetings(events: unknown, now: number): Meeting[] {
  if (!Array.isArray(events)) return [];
  const meetings: Meeting[] = [];
  for (const raw of events) {
    const event = fields(raw);
    if (event.status === 'cancelled' || NOT_MEETINGS.has(String(event.eventType))) continue;
    if (myAnswer(event) === 'declined') continue;
    const start = Date.parse(String(fields(event.start).dateTime));
    const end = Date.parse(String(fields(event.end).dateTime));
    if (Number.isNaN(start) || Number.isNaN(end) || end <= now) continue;
    const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
    const joinUrl = joinLink(event);
    meetings.push({
      id: typeof event.id === 'string' ? event.id : `${start}-${summary}`,
      title: summary.slice(0, TITLE_MAX) || UNTITLED_MEETING,
      start,
      end,
      ...(joinUrl ? { joinUrl } : {}),
      ...(isQuiet(event, end - start, joinUrl) ? { quiet: true } : {}),
    });
  }
  return meetings.sort((a, b) => a.start - b.start).slice(0, MEETINGS_MAX);
}
