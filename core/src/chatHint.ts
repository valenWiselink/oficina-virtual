/**
 * The note the office chat adds after a message, so the answer fits a bubble
 * (asked 2026-10-20: long answers made the bubble huge). Shared: the page
 * adds it and never shows it; the server drops it before reading what
 * Valentín said («listo» must stay «listo» to answer a «Te toca»).
 */
export const CHAT_HINT =
  '(Te escribo desde el chat de la oficina: respondé corto, como en un chat; sin títulos ni tablas salvo que hagan falta.)';

/** The message as he wrote it: without the note the chat added. */
export function withoutChatHint(text: string): string {
  const at = text.lastIndexOf(CHAT_HINT);
  if (at < 0) return text;
  return (text.slice(0, at) + text.slice(at + CHAT_HINT.length)).trim();
}
