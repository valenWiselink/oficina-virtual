/**
 * Which lines of a Claude Code screen are messages the user sent. Claude Code
 * prints a sent message at column 0 behind its prompt glyph (`❯`, `>` in older
 * versions) and wraps it itself, indenting the rest by two spaces — blank
 * lines included when the message has paragraphs:
 *
 *   ❯ App Review Guideline Issue
 *
 *     This is an automated message…
 *
 * Everything Claude writes starts at column 0 with its own glyph (`●`, `✻`)
 * or hangs under one (`  ⎿`), so the message runs until such a line. Blank
 * lines belong to it only when more of the message follows (not the gap
 * before Claude's answer). Two look-alikes are skipped: the live input box
 * (the prompt line right under a `────` rule) and a selection menu's cursor
 * (`❯ 1. Yes`).
 */

const SENT = /^[❯>] +\S/;
const MENU_CURSOR = /^❯ +\d+\./;
const RULE = /^[─━]{3,}/;
// Not `  ⎿`: a slash command's output hangs right under the command.
const CONTINUATION = /^ {2}[^\s⎿]/;
const BLANK = /^\s*$/;

/** Whether a blank line at `i` sits inside the message: the next non-blank
 *  line is more of it. Unknown (end of what was read) counts as not. */
function blankInside(lines: readonly string[], i: number): boolean {
  for (let j = i + 1; j < lines.length; j++) {
    if (!BLANK.test(lines[j])) return CONTINUATION.test(lines[j]);
  }
  return false;
}

/**
 * Mark each line as the user's or not. `above` is the line just before the
 * first one and whether it was marked, so a scan can resume mid-buffer.
 */
export function markPromptLines(
  lines: readonly string[],
  above: { text: string; marked: boolean } = { text: '', marked: false },
): boolean[] {
  const marks: boolean[] = [];
  let prevText = above.text;
  let inMessage = above.marked;
  lines.forEach((text, i) => {
    if (SENT.test(text)) {
      inMessage = !MENU_CURSOR.test(text) && !RULE.test(prevText);
      marks.push(inMessage);
    } else if (inMessage && BLANK.test(text)) {
      // A gap inside the message keeps it going; the gap after it does not.
      const inside = blankInside(lines, i);
      marks.push(inside);
      inMessage = inside;
    } else {
      inMessage = inMessage && CONTINUATION.test(text);
      marks.push(inMessage);
    }
    prevText = text;
  });
  return marks;
}
