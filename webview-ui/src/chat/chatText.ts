/**
 * What the chat adds to and reads from a message. Pure, so it is tested
 * without a DOM.
 */

/** Sent after a message written in the chat, so the answer fits a bubble
 *  (asked 2026-10-20: long answers made the bubble huge). Never shown in the
 *  chat: withoutChatHint drops it. */
export const CHAT_HINT =
  '(Te escribo desde el chat de la oficina: respondé corto, como en un chat; sin títulos ni tablas salvo que hagan falta.)';

export function withChatHint(text: string): string {
  // A message of only images is the hint alone (after their «[Image #1]»).
  return text.trim() ? `${text.trim()}\n\n${CHAT_HINT}` : CHAT_HINT;
}

/** The message as you wrote it: without the hint the chat added. */
export function withoutChatHint(text: string): string {
  const at = text.lastIndexOf(CHAT_HINT);
  if (at < 0) return text;
  return (text.slice(0, at) + text.slice(at + CHAT_HINT.length)).trim();
}

/** Characters you cannot see that Claude Code drops from what it records: a
 *  copied «$ bash» carried U+0096 in front, the transcript had none, and the
 *  message stayed «En cola» under newer ones (2026-10-30). Control and
 *  format characters, soft hyphen, zero-width ones, the BOM. */
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

const normalize = (text: string) =>
  withoutChatHint(text).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();

/** How much of a long message has to match: Claude Code may shorten a long
 *  paste in the transcript ("[Pasted text #1 +20 lines]"). */
const PREFIX_CHARS = 60;

/** The transcript's user message is the one the chat just sent. */
export function sameMessage(sent: string, recorded: string): boolean {
  const a = normalize(sent);
  const b = normalize(recorded);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= PREFIX_CHARS && b.startsWith(a.slice(0, PREFIX_CHARS));
}

/** The transcript's user line is a message the chat sent, images and all:
 *  one with images is only matched by a line that has them, and one of
 *  only images by a line with no text of yours. */
export function sameSent(
  sent: { text: string; images?: readonly string[] },
  recorded: { text: string; images?: number },
): boolean {
  if (sent.images?.length) {
    if (!recorded.images) return false;
    if (!normalize(sent.text)) return !normalize(recorded.text);
  }
  return sameMessage(sent.text, recorded.text);
}

/**
 * Which pending messages the transcript's new user lines show, by key: the
 * line with the same text, or else — for one the terminal already took — the
 * next line of yours written since it was sent, in order (Claude Code reads
 * queued messages one after the other). So a message it recorded a little
 * differently is not left «En cola» under the conversation forever.
 */
export function shownPending<
  P extends {
    key: string;
    text: string;
    images?: readonly string[];
    at: number;
    delivery: PendingDelivery;
    /** The lines the conversation already had when it was sent: an older
     *  message with the same text is not this one. */
    before?: ReadonlySet<string>;
  },
  U extends { id: string; text: string; images?: number; at?: number; voice?: boolean },
>(waiting: readonly P[], lines: readonly U[]): Map<string, U> {
  const shown = new Map<string, U>();
  const taken = new Set<string>();
  const usersFor = (p: P) => lines.filter((u) => !p.before?.has(u.id));
  for (const p of waiting) {
    const same = usersFor(p).find((u) => !taken.has(u.id) && sameSent(p, u));
    if (same) {
      shown.set(p.key, same);
      taken.add(same.id);
    }
  }
  for (const p of waiting) {
    if (shown.has(p.key) || p.delivery !== 'sent') continue;
    const next = usersFor(p).find(
      (u) =>
        !taken.has(u.id) &&
        !u.voice &&
        u.at !== undefined &&
        u.at >= p.at &&
        !waiting.some((o) => o !== p && sameSent(o, u)),
    );
    if (!next) break; // the ones after it were sent later still
    shown.set(p.key, next);
    taken.add(next.id);
  }
  return shown;
}

/**
 * The delivered messages that can no longer be waiting: Claude Code reads
 * what you send in order, so once a message sent later is in the
 * conversation (`readUpTo`, when it was sent), one sent before it was read
 * too, even if the chat did not recognise its line. Without this it stayed
 * «En cola» under the newer one (2026-10-30, «apruebo el plan de caja»).
 */
export function passedPending<P extends { key: string; at: number; delivery: PendingDelivery }>(
  waiting: readonly P[],
  readUpTo: number,
): Set<string> {
  return new Set(waiting.filter((p) => p.delivery === 'sent' && p.at < readUpTo).map((p) => p.key));
}

/** An answer long enough to fold in its bubble (lines or characters). */
export const FOLD_LINES = 14;
export const FOLD_CHARS = 1400;

export function isLongAnswer(text: string): boolean {
  return text.split('\n').length > FOLD_LINES || text.length > FOLD_CHARS;
}

/** Where a message sent from the chat is: on its way to the agent's terminal,
 *  in it, or never got there (it was away past the hold). */
export type PendingDelivery = 'sending' | 'sent' | 'failed';

/**
 * What the chat says under a message the conversation does not show yet,
 * beside "Vos". Once it reached the terminal the ✓ says so and there is
 * nothing to add (undefined) — unless a busy agent will read it when its
 * turn ends ("En cola", while it works) or, once it stops, `late` (no sign
 * of it for a while) sends you to the terminal.
 */
export function pendingNote(
  delivery: PendingDelivery,
  busy: boolean,
  late: boolean,
): string | undefined {
  if (delivery === 'failed') return 'No le llegó: su terminal no estaba conectada';
  if (delivery === 'sending') return 'Enviando…';
  if (busy) return 'En cola: lo lee cuando termine lo que está haciendo';
  return late ? 'Todavía no aparece en la conversación: fijate en la terminal' : undefined;
}
