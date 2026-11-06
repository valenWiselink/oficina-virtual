import type { PendingAsksList } from '../../../core/src/messages.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Since when it waits: near things by the clock, the rest by the calendar. */
export function askWhen(at: number, now: number): string {
  const ago = now - at;
  if (ago < MINUTE) return 'recién';
  if (ago < HOUR) return `hace ${Math.floor(ago / MINUTE)} min`;
  const days = Math.round((dayStart(now) - dayStart(at)) / (24 * HOUR));
  if (days <= 0) return `hace ${Math.floor(ago / HOUR)} h`;
  if (days === 1) return 'ayer';
  return new Date(at)
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '');
}

/** What still waits on you, and what only looks done (shown apart, not counted). */
export function splitOpen<T extends { seemsDone?: string }>(
  open: readonly T[],
): { waiting: T[]; seemsDone: T[] } {
  return {
    waiting: open.filter((a) => !a.seemsDone),
    seemsDone: open.filter((a) => !!a.seemsDone),
  };
}

export function readPendingAsksMessage(msg: Record<string, unknown>): PendingAsksList | null {
  if (msg.type !== 'pendingAsks' || !Array.isArray(msg.open) || !Array.isArray(msg.closed)) {
    return null;
  }
  return msg as unknown as PendingAsksList;
}
