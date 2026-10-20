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
  return `${text.trim()}\n\n${CHAT_HINT}`;
}

/** The message as you wrote it: without the hint the chat added. */
export function withoutChatHint(text: string): string {
  const at = text.lastIndexOf(CHAT_HINT);
  if (at < 0) return text;
  return (text.slice(0, at) + text.slice(at + CHAT_HINT.length)).trim();
}

const normalize = (text: string) => withoutChatHint(text).replace(/\s+/g, ' ').trim();

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

/** An answer long enough to fold in its bubble (lines or characters). */
export const FOLD_LINES = 14;
export const FOLD_CHARS = 1400;

export function isLongAnswer(text: string): boolean {
  return text.split('\n').length > FOLD_LINES || text.length > FOLD_CHARS;
}
