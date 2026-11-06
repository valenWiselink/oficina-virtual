/**
 * The strip above «Ahora»: the rest of today in one line — each meeting
 * still ahead, and each pending ask with a time today (the pase «a las 23»,
 * what has to be done «antes de las 15»). Hot when it is within the hour.
 */
import type { Ranked } from './nowRules.js';
import type { MeetingTime } from './nowTime.js';
import { hourText } from './nowTime.js';

export interface StripItem {
  key: string;
  at: number;
  /** «15:00» or «antes de 14:45» */
  when: string;
  label: string;
  kind: 'meeting' | 'start' | 'due';
  /** Within the hour (or under way). */
  hot: boolean;
  /** «en 40 min», «ahora» */
  soon?: string;
  joinUrl?: string;
}

const HOUR = 3_600_000;
const LABEL_MAX = 48;

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

function soonText(at: number, now: number): string | undefined {
  const left = at - now;
  if (left <= 0) return 'ahora';
  if (left < HOUR) return `en ${Math.max(1, Math.round(left / 60_000))} min`;
  return undefined;
}

export function dayStrip(
  meetings: ReadonlyArray<MeetingTime & { id?: string; quiet?: boolean; joinUrl?: string }>,
  asks: readonly Ranked[],
  now: number,
): StripItem[] {
  const items: StripItem[] = [];
  for (const m of meetings) {
    if (m.quiet || m.end <= now || !sameDay(m.start, now)) continue;
    items.push({
      key: `m-${m.id ?? m.start}`,
      at: m.start,
      when: hourText(m.start),
      label: clip(m.title),
      kind: 'meeting',
      hot: m.start - now < HOUR,
      soon: soonText(m.start, now),
      joinUrl: m.joinUrl,
    });
  }
  for (const r of asks) {
    const { notBefore, due } = r.times;
    if (notBefore !== undefined && notBefore > now && sameDay(notBefore, now)) {
      items.push({
        key: `s-${r.ask.id}`,
        at: notBefore,
        when: hourText(notBefore),
        label: clip(r.ask.text),
        kind: 'start',
        hot: notBefore - now < HOUR,
        soon: soonText(notBefore, now),
      });
    } else if (due !== undefined && due > now && sameDay(due, now)) {
      items.push({
        key: `d-${r.ask.id}`,
        at: due,
        when: `antes de ${hourText(due)}`,
        label: clip(r.ask.text),
        kind: 'due',
        hot: due - now < HOUR,
        soon: soonText(due, now),
      });
    }
  }
  return items.sort((a, b) => a.at - b.at);
}
