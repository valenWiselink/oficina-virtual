/** What the office does with a key pressed inside a terminal (null: it
 *  belongs to the program running there). */
export type TerminalShortcut = 'zoomIn' | 'zoomOut' | 'zoomReset' | 'search';

/**
 * The office's own keys inside a terminal. Kept to combinations Claude Code
 * does not use: Ctrl + / Ctrl − / Ctrl 0 for the font (as in any browser or
 * editor) and Ctrl+Shift+F for search — plain Ctrl+F stays the program's.
 */
export function terminalShortcut(ev: {
  type: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): TerminalShortcut | null {
  if (ev.type !== 'keydown' || ev.altKey) return null;
  const mod = ev.ctrlKey || ev.metaKey;
  if (!mod) return null;
  if (ev.shiftKey && (ev.key === 'F' || ev.key === 'f')) return 'search';
  if (ev.key === '+' || ev.key === '=') return 'zoomIn';
  if (ev.key === '-' || ev.key === '_') return 'zoomOut';
  if (ev.key === '0' && !ev.shiftKey) return 'zoomReset';
  return null;
}
