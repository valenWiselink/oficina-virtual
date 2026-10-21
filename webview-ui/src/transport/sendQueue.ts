import type { ClientMessage } from '../../../core/src/messages.js';

/**
 * What the page may still send once the office answers again. Agent ids start
 * over on every server start, so a late message could act on whoever has that
 * number now: the ones that change an agent by its id are never held, and the
 * rest only for a few seconds (a click that old no longer means what it meant).
 */

/** Messages that change an agent picked by its number: sent now or never. */
const NEVER_HELD: ReadonlySet<string> = new Set([
  'closeAgent',
  'editAgent',
  'setAgentRun',
  'setSupervision',
  'supervisionTeam',
  'handOffResult',
  'adoptIntoOffice',
]);

/** Asks for the whole state again: worth sending however late. */
const ALWAYS_WORTH: ReadonlySet<string> = new Set(['webviewReady']);

/** How long anything else stays worth sending. */
export const HELD_MAX_AGE_MS = 5_000;

export interface HeldMessage {
  message: ClientMessage;
  at: number;
}

/** Whether this message may wait for the connection at all. */
export function mayHold(message: ClientMessage): boolean {
  return !NEVER_HELD.has(message.type);
}

/** Whether a held message still goes out when the connection is back. */
export function stillWorthSending(held: HeldMessage, now: number): boolean {
  return ALWAYS_WORTH.has(held.message.type) || now - held.at <= HELD_MAX_AGE_MS;
}
