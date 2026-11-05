import type { Meeting, UpcomingMeetings } from '../../../core/src/messages.js';

/** From this close a meeting is "por empezar". */
export const SOON_MS = 15 * 60_000;
/** The toast before it starts; the one at the start only this long after it. */
export const TOAST_BEFORE_MS = 5 * 60_000;
const TOAST_LATE_MS = 10 * 60_000;

export type MeetingState = 'live' | 'soon' | 'later';

export function meetingState(meeting: Meeting, now: number): MeetingState {
  if (meeting.start <= now) return 'live';
  return meeting.start - now <= SOON_MS ? 'soon' : 'later';
}

/** What the row says beside the time; nothing for what is not close yet. */
export function meetingBadge(meeting: Meeting, now: number): string | null {
  const state = meetingState(meeting, now);
  if (state === 'live') return 'Ahora';
  if (state === 'later') return null;
  return countdown(meeting, now);
}

/** Half a minute left still says a whole one, never "En 0 min". */
function countdown(meeting: Meeting, now: number): string {
  return `En ${Math.ceil((meeting.start - now) / 60_000)} min`;
}

export function formatHour(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days apart in local time (a DST day is not 24 hours). */
function daysBetween(from: number, to: number): number {
  return Math.round((dayStart(to) - dayStart(from)) / 86_400_000);
}

function dayLabel(ms: number, now: number): string {
  const days = daysBetween(now, ms);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return new Date(ms)
    .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '');
}

export interface MeetingDay {
  label: string;
  meetings: Meeting[];
}

/** What is not over yet, soonest first, under its day. */
export function meetingDays(meetings: Meeting[], now: number): MeetingDay[] {
  const days: MeetingDay[] = [];
  for (const meeting of meetings) {
    if (meeting.end <= now) continue;
    const label = dayLabel(meeting.start, now);
    const last = days[days.length - 1];
    if (last?.label === label) last.meetings.push(meeting);
    else days.push({ label, meetings: [meeting] });
  }
  return days;
}

/** One meeting's key for what you dismissed (a moved one asks again). */
export function meetingKey(meeting: Meeting): string {
  return `${meeting.id}:${meeting.start}`;
}

/** How loud the chip is: painted, a countdown, or just there. */
export type ChipLevel = 'now' | 'soon' | 'calm';

export interface MeetingChip {
  level: ChipLevel;
  meeting: Meeting;
  /** What goes before the title: «Ahora», «En 8 min», «Mañana 09:00». */
  when: string;
  /** Others you should attend to at the same time. */
  alsoNow: Meeting[];
  /** Offer «Unirse»: it is on, or about to be. */
  joinable: boolean;
}

function calmWhen(meeting: Meeting, now: number): string {
  if (meeting.start <= now) return 'Ahora';
  if (meeting.start - now <= SOON_MS) return countdown(meeting, now);
  const days = daysBetween(now, meeting.start);
  const hour = formatHour(meeting.start);
  return days <= 0 ? hour : `${dayLabel(meeting.start, now)} ${hour}`;
}

/**
 * What the chip beside the tabs says. A meeting you should be in comes first,
 * the one that started last if several overlap (the earlier ones you are in or
 * chose to miss) and the rest counted beside it; then the one about to start;
 * else simply the next. Dismissing one, or a `quiet` one, never paints.
 */
export function meetingChip(
  meetings: Meeting[],
  now: number,
  dismissed: (key: string) => boolean = () => false,
): MeetingChip | null {
  const ahead = meetings.filter((m) => m.end > now);
  const loud = ahead.filter((m) => !m.quiet && !dismissed(meetingKey(m)));
  const live = loud.filter((m) => m.start <= now).sort((a, b) => b.start - a.start);
  const [current, ...overlapping] = live;
  if (current) {
    return {
      level: 'now',
      meeting: current,
      when: 'Ahora',
      alsoNow: overlapping,
      joinable: true,
    };
  }
  const soon = loud.find((m) => m.start - now <= SOON_MS);
  if (soon) {
    const alsoNow = loud.filter((m) => m !== soon && m.start === soon.start);
    return { level: 'soon', meeting: soon, when: countdown(soon, now), alsoNow, joinable: true };
  }
  // One you dismissed stays at hand until it ends. A quiet one (a block of the
  // whole day, say) never hides what is really next.
  const next =
    ahead.find((m) => m.start <= now && !m.quiet && dismissed(meetingKey(m))) ??
    loud[0] ??
    ahead[0];
  if (!next) return null;
  return {
    level: 'calm',
    meeting: next,
    when: calmWhen(next, now),
    alsoNow: [],
    // Dismissed or quiet: no paint, and the link still at hand once it is on.
    joinable: next.start - now <= SOON_MS,
  };
}

/** The toast a meeting is due right now, if any, and the key to send it once. */
export function meetingToast(
  meeting: Meeting,
  now: number,
): { key: string; title: string; body: string } | null {
  if (meeting.quiet || meeting.end <= now) return null;
  const left = meeting.start - now;
  if (left > TOAST_BEFORE_MS || -left > TOAST_LATE_MS) return null;
  const base = meetingKey(meeting);
  return left > 0
    ? { key: `${base}:antes`, title: countdown(meeting, now), body: meeting.title }
    : { key: `${base}:ahora`, title: 'Ya empezó tu reunión', body: meeting.title };
}

export function readMeetingsMessage(msg: Record<string, unknown>): UpcomingMeetings | null {
  if (msg.type !== 'upcomingMeetings' || !Array.isArray(msg.meetings)) return null;
  return msg as unknown as UpcomingMeetings;
}
