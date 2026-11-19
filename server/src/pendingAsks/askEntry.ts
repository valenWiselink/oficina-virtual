import type { PendingAskEntry } from '../../../core/src/messages.js';
import { prStateOf } from '../mergedAsk.js';
import { type MergeTarget, mergeTargetOf } from './mergeTarget.js';
import type { StoredAsk } from './pendingAsks.js';

/** How a pending ask looks on the page: apart or not, and its entry. */

const HOUR = 3_600_000;
/** Nobody touched it in this long: «¿Sigue?». */
export const STALE_MS = 24 * HOUR;

const hourOf = (ms: number): string =>
  new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** Shown apart from what waits: looks done, he answered it, or «¿Sigue?». */
export function lookDone(ask: StoredAsk): boolean {
  return !!ask.seemsDone || ask.answeredAt !== undefined || ask.staleSince !== undefined;
}

export function isStale(ask: StoredAsk, now: number): boolean {
  if (lookDone(ask) || ask.heldUntil !== undefined) return false;
  if (ask.notBefore !== undefined && ask.notBefore > now) return false;
  return now - (ask.touchedAt ?? ask.at) >= STALE_MS;
}

/** Why it is shown apart, in words for its card. */
function apartReason(ask: StoredAsk): string | undefined {
  if (ask.seemsDone) return ask.seemsDone;
  if (ask.answeredAt !== undefined) {
    return `Le contestaste a Jarvis a las ${hourOf(ask.answeredAt)}: se cierra solo en 2 h si nadie lo reabre`;
  }
  if (ask.staleSince !== undefined) {
    const hours = Math.round((ask.staleSince - (ask.touchedAt ?? ask.at)) / HOUR);
    return `¿Sigue? Nadie lo movió en ${hours} h`;
  }
  return undefined;
}

/** The PR its «Mergear» button merges: only while it is not merged or closed. */
export function openMergeTarget(ask: StoredAsk): MergeTarget | undefined {
  if (ask.closedAt !== undefined) return undefined;
  const target = mergeTargetOf(ask);
  const state = target ? prStateOf(target.url) : undefined;
  return state === 'merged' || state === 'closed' ? undefined : target;
}

export function toEntry(ask: StoredAsk): PendingAskEntry {
  const merge = openMergeTarget(ask);
  const open = ask.closedAt === undefined;
  const apart = open ? apartReason(ask) : undefined;
  return {
    id: ask.id,
    from: ask.from,
    text: ask.text,
    at: ask.at,
    ...(ask.command ? { command: ask.command } : {}),
    ...(open && ask.due !== undefined ? { due: ask.due } : {}),
    ...(open && ask.notBefore !== undefined ? { notBefore: ask.notBefore } : {}),
    ...(open && ask.why ? { why: ask.why } : {}),
    ...(open && ask.ifNot ? { ifNot: ask.ifNot } : {}),
    ...(open && ask.question ? { question: true } : {}),
    ...(open && ask.options?.length ? { options: ask.options } : {}),
    ...(open && ask.after ? { after: ask.after } : {}),
    ...(open && ask.delegatedTo ? { delegatedTo: ask.delegatedTo } : {}),
    ...(merge
      ? { mergeUrl: merge.url, mergeCommand: `gh pr merge ${merge.url} ${merge.args.join(' ')}` }
      : {}),
    ...(apart ? { seemsDone: apart } : {}),
    ...(ask.closedAt !== undefined ? { closedAt: ask.closedAt } : {}),
    ...(ask.closedHow ? { closedHow: ask.closedHow } : {}),
    ...(ask.closedAt !== undefined && ask.closedAuto ? { autoClosed: true } : {}),
    ...(ask.closedAt !== undefined && ask.turnIds.length > 0 ? { turnIds: ask.turnIds } : {}),
  };
}
