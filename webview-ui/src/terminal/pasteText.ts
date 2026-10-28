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

/**
 * A message with images, as its pastes: each image's path alone — that is
 * what Claude Code turns into «[Image #1]»; with text around it, it only
 * reads the file — quoted when it has spaces (as a dropped file is), then
 * the text, if any.
 */
export function messagePastes(
  text: string,
  images: readonly string[],
  bracketed: boolean,
): string[] {
  const paths = images.map((p) => pasteText(/\s/.test(p) ? `"${p}"` : p, bracketed));
  return text ? [...paths, pasteText(text, bracketed)] : paths;
}
