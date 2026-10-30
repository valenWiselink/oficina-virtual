/**
 * Whether a Claude Code screen is asking something: a permission prompt or an
 * AskUserQuestion, both drawn as a numbered menu with the cursor on one option
 * ("❯ 1. Yes" over "  2. No"). Anything else on screen — a shell command still
 * running ("Running 1 shell command … (ctrl+b to run in background)"), the
 * spinner, the empty input prompt — asks nothing.
 *
 * It backs the no-hooks permission guess: a tool silent for a few seconds is
 * only a question if its terminal shows one (2026-10-30: a 45 s command showed
 * "Te hizo una pregunta con opciones" and locked Jarvis's chat).
 */

/** A menu sits at the bottom of the screen: only look this far up. */
const MENU_TAIL_LINES = 30;
const CURSOR_OPTION = /^\s*[❯›>]\s*(\d+)\.\s+\S/;
const OPTION = /^\s*(?:[❯›>]\s*)?(\d+)\.\s+\S/;

export function screenAsks(lines: readonly string[]): boolean {
  const tail = lines.filter((l) => l.trim() !== '').slice(-MENU_TAIL_LINES);
  const cursorAt = tail.findIndex((l) => CURSOR_OPTION.test(l));
  if (cursorAt < 0) return false;
  const chosen = tail[cursorAt].match(CURSOR_OPTION)![1];
  // A menu offers at least two options; one numbered line under a "❯" is
  // just text (a message that starts with "1.").
  return tail.some((l, i) => {
    const n = i === cursorAt ? undefined : l.match(OPTION)?.[1];
    return n !== undefined && n !== chosen;
  });
}
