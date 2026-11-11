/**
 * The «Asistente» screen (design C «Momentos», chosen 2026-11-11): the
 * conversation with Jarvis in the middle, and around it what the moment
 * calls for. The office picks the moment from the calendar, the clock, what
 * waits on you and whether you are writing; a moment chosen by hand holds
 * until that situation changes. Pure rules (tested).
 *
 * - «Reunión»: a meeting under way. Jarvis keeps quiet, only what holds
 *   someone back shows; the rest waits for the end; what you write to Jarvis
 *   goes as a note of that meeting.
 * - «Cierre del día»: from 19:00. What got done, what is left for tomorrow,
 *   who to close.
 * - «Decidir»: something waits on you. Cards above Jarvis's box, the team
 *   on the left, what comes on the right.
 * - «Escribir»: nothing waits, or you are writing: just the conversation.
 */
import type { DayLogEntry } from '../../../core/src/messages.js';

export type Moment = 'escribir' | 'decidir' | 'reunion' | 'cierre';

export const MOMENT_KEY = 'oficina.momento';
/** Cards shown before «y N más». */
export const HAND_SHOWN = 3;
/** The team's activity: this many buckets of this long, oldest first. */
export const ACTIVITY_BUCKETS = 6;
const BUCKET_MS = 5 * 60_000;
/** From this hour the day is closing. */
export const CLOSING_HOUR = 19;
/** In a meeting, what is due this soon after it ends still shows. */
const DUE_GRACE_MS = 15 * 60_000;

export interface MomentMeeting {
  title: string;
  start: number;
  end: number;
  quiet?: boolean;
  joinUrl?: string;
}

export interface MomentContext {
  now: number;
  meetings: readonly MomentMeeting[];
  /** Asks waiting on you now. */
  waiting: number;
  /** Writing in Jarvis's box (focused, with text). */
  typing: boolean;
}

/** A moment chosen by hand, and the situation it was chosen in. */
export interface MomentChoice {
  moment: Moment;
  /** The moment the office would have picked then (without typing). */
  base: Moment;
}

const MOMENTS: readonly Moment[] = ['escribir', 'decidir', 'reunion', 'cierre'];

/** The meeting under way, if any (not one you marked «sin aviso»). */
export function meetingNow(
  meetings: readonly MomentMeeting[],
  now: number,
): MomentMeeting | undefined {
  return meetings.find((m) => !m.quiet && m.start <= now && now < m.end);
}

/** What the office picks from the situation, before any typing. */
export function baseMoment(ctx: MomentContext): Moment {
  if (meetingNow(ctx.meetings, ctx.now)) return 'reunion';
  if (new Date(ctx.now).getHours() >= CLOSING_HOUR) return 'cierre';
  return ctx.waiting > 0 ? 'decidir' : 'escribir';
}

/**
 * The moment on screen: the one chosen by hand while the situation is the
 * one it was chosen in; otherwise the office's, folded into «Escribir» while
 * you write (not in a meeting: there you write notes).
 */
export function currentMoment(ctx: MomentContext, choice: MomentChoice | undefined): Moment {
  const base = baseMoment(ctx);
  if (choice && choice.base === base) return choice.moment;
  return ctx.typing && base !== 'reunion' ? 'escribir' : base;
}

/** Why the office is in this moment, in a few words; undefined when chosen by hand. */
export function momentReason(
  moment: Moment,
  ctx: MomentContext,
  chosen: boolean,
): string | undefined {
  if (chosen) return undefined;
  const meeting = meetingNow(ctx.meetings, ctx.now);
  if (moment === 'reunion' && meeting) return `En reunión hasta las ${clock(meeting.end)}`;
  if (moment === 'cierre') return 'Ya son más de las 19';
  if (moment === 'escribir' && ctx.typing) return 'Estás escribiendo: lo demás espera';
  if (moment === 'decidir')
    return ctx.waiting === 1 ? 'Te espera una decisión' : `Te esperan ${ctx.waiting} decisiones`;
  return undefined;
}

const clock = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** A choice remembered in the browser; nothing for junk or an old plain moment. */
export function readChoice(raw: string | null): MomentChoice | undefined {
  if (!raw?.startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<MomentChoice>;
    const valid = (m: unknown): m is Moment => MOMENTS.includes(m as Moment);
    return valid(parsed.moment) && valid(parsed.base)
      ? { moment: parsed.moment, base: parsed.base }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * In a meeting, what still shows: what holds someone back or is due by
 * shortly after it ends. The rest waits for the end.
 */
export function urgentInMeeting(
  entry: { blocks: readonly string[]; times: { due?: number } },
  meeting: MomentMeeting,
): boolean {
  if (entry.blocks.length > 0) return true;
  return entry.times.due !== undefined && entry.times.due <= meeting.end + DUE_GRACE_MS;
}

/** What you write to Jarvis during a meeting goes as a note of it. */
export function meetingNote(meeting: MomentMeeting, text: string): string {
  return `[Nota de la reunión «${meeting.title}»] ${text}`;
}

/**
 * How busy an agent was in the last half hour, from the day's log: one count
 * per five minutes, oldest first (a little bar chart beside its name).
 */
export function activityOf(entries: readonly DayLogEntry[], agent: string, now: number): number[] {
  const buckets = new Array<number>(ACTIVITY_BUCKETS).fill(0);
  const since = now - ACTIVITY_BUCKETS * BUCKET_MS;
  for (const e of entries) {
    if (e.agent !== agent || e.at <= since || e.at > now) continue;
    const i = Math.min(ACTIVITY_BUCKETS - 1, Math.floor((e.at - since) / BUCKET_MS));
    buckets[i] += 1;
  }
  return buckets;
}

/** How far a card must travel sideways to count as a swipe (px). */
export const SWIPE_PX = 80;

/** A drag on a card: mostly sideways and far enough, or nothing (a tap, a scroll). */
export function swipeOf(dx: number, dy: number): 'left' | 'right' | undefined {
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx)) return undefined;
  return dx > 0 ? 'right' : 'left';
}

/** The cards in sight and how many wait behind them. */
export function handOf<T>(waiting: readonly T[], all: boolean): { shown: T[]; more: number } {
  const shown = all ? [...waiting] : waiting.slice(0, HAND_SHOWN);
  return { shown, more: waiting.length - shown.length };
}

/** The moment's name in its bar: «Decidir · 3», «Reunión», «Cierre del día». */
export function momentLabel(moment: Moment, waiting: number): string {
  if (moment === 'decidir') return waiting > 0 ? `Decidir · ${waiting}` : 'Decidir';
  if (moment === 'reunion') return 'Reunión';
  if (moment === 'cierre') return 'Cierre del día';
  return 'Escribir';
}
