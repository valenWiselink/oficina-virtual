import type { Meeting, UpcomingMeetings } from '../../../core/src/messages.js';

/** From this close a meeting is "por empezar". */
export const SOON_MS = 15 * 60_000;

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

/** The first one not over, for the minimized panel. */
export function nextMeeting(meetings: Meeting[], now: number): Meeting | undefined {
  return meetings.find((m) => m.end > now);
}

export function readMeetingsMessage(msg: Record<string, unknown>): UpcomingMeetings | null {
  if (msg.type !== 'upcomingMeetings' || !Array.isArray(msg.meetings)) return null;
  return msg as unknown as UpcomingMeetings;
}
