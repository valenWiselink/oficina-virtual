/**
 * What pasting `text` into a terminal sends, as xterm's own paste does:
 * newlines as CR, inside bracketed-paste markers when the running app turned
 * that mode on — Claude Code has, and without the markers a multiline
 * message would submit at its first newline.
 */
export function pasteText(text: string, bracketed: boolean): string {
  const body = text.replace(/\r?\n/g, '\r');
  return bracketed ? `\x1b[200~${body}\x1b[201~` : body;
}
