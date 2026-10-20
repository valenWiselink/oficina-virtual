import type { IDecoration, IDecorationOptions, Terminal } from '@xterm/xterm';

import { type Paint, type PaintCarry, paintLines, type PaintRole } from './answerPaint.js';
import { markPromptLines } from './promptLines.js';
import type { TerminalScheme } from './terminalSchemes.js';

const SCAN_DEBOUNCE_MS = 120;
/** Lines from the bottom that get decorated (older scrollback stays plain,
 *  so a long session never piles up thousands of decorations). */
const DECORATED_LINES = 4000;

/** What a decoration marks, to resume a scan mid-buffer. */
type Mark = { d: IDecoration; key: string; mine: boolean; carry: PaintCarry };
type Wanted = {
  line: number;
  mine: boolean;
  carry: PaintCarry;
  options: Omit<IDecorationOptions, 'marker'>;
};

/** Colours for the paints over Claude's text (answerPaint.ts). */
export type PaintColors = Record<PaintRole, { foreground: string; background?: string }>;

/**
 * Highlight the messages the user sent (promptLines.ts) so they stand out
 * from what Claude writes, with a tick on the scrollbar to find them again —
 * and, when `paint` is given, colour what Claude writes (answerPaint.ts).
 *
 * Scrollback never changes once written, so each scan only re-reads from the
 * top of the screen as it was at the previous scan — the part Claude Code
 * may have redrawn since. A clear or reset shrinks the buffer (and disposes
 * the markers under the decorations): then everything is read again.
 * Returns the detach.
 */
export function attachPromptMarks(
  term: Terminal,
  colors: TerminalScheme['prompt'],
  paint?: PaintColors,
): () => void {
  let marks: Mark[] = [];
  let rescanFrom = 0;
  let lastLength = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const drop = (m: Mark) => {
    m.d.dispose();
    m.d.marker.dispose();
  };

  const add = (line: number, cursorLine: number, options: Omit<IDecorationOptions, 'marker'>) => {
    const marker = term.registerMarker(line - cursorLine);
    if (!marker) return null;
    const d = term.registerDecoration({ marker, ...options });
    if (!d) marker.dispose();
    return d ?? null;
  };

  const scan = () => {
    timer = null;
    const buf = term.buffer.active;
    if (buf.type !== 'normal') return;
    if (buf.length < lastLength) rescanFrom = 0;
    const from = Math.max(Math.min(rescanFrom, buf.length), buf.length - DECORATED_LINES);

    const lines: string[] = [];
    for (let y = from; y < buf.length; y++) {
      lines.push(buf.getLine(y)?.translateToString(true) ?? '');
    }
    const live = (m: Mark) => !m.d.marker.isDisposed;
    const above = marks.filter((m) => live(m) && m.d.marker.line === from - 1);
    const aboveText = from > 0 ? (buf.getLine(from - 1)?.translateToString(true) ?? '') : '';
    const mine = markPromptLines(lines, { text: aboveText, marked: above.some((m) => m.mine) });
    const painted = paint
      ? paintLines(lines, mine, above.find((m) => !m.mine)?.carry ?? 'none')
      : null;

    // What the re-read part should carry, by key: what is already there stays
    // untouched, so a write does not re-create the whole screen's decorations.
    const wanted = new Map<string, Wanted>();
    lines.forEach((_, i) => {
      const line = from + i;
      if (mine[i]) {
        wanted.set(`${line}:mine`, {
          line,
          mine: true,
          carry: 'none',
          options: bandOptions(colors, term.cols),
        });
        return;
      }
      for (const p of painted?.paints[i] ?? []) {
        const options = paintOptions(p, paint!, term.cols);
        wanted.set(`${line}:${p.x}:${p.width}:${p.role}`, {
          line,
          mine: false,
          carry: painted!.carries[i],
          options,
        });
      }
    });
    marks = marks.filter((m) => {
      if (live(m) && m.d.marker.line < from) return true;
      if (live(m) && wanted.delete(m.key)) return true;
      drop(m);
      return false;
    });
    const cursorLine = buf.baseY + buf.cursorY;
    for (const [key, w] of wanted) {
      const d = add(w.line, cursorLine, w.options);
      if (d) marks.push({ d, key, mine: w.mine, carry: w.carry });
    }

    rescanFrom = buf.baseY;
    lastLength = buf.length;
  };

  const schedule = () => {
    if (timer === null) timer = setTimeout(scan, SCAN_DEBOUNCE_MS);
  };
  const written = term.onWriteParsed(schedule);
  // Claude Code repaints the whole screen at the new width; the old
  // decorations were sized for the old one.
  const resized = term.onResize(() => {
    rescanFrom = 0;
    schedule();
  });
  // Attached over a terminal that already has output (a change of look).
  schedule();

  return () => {
    if (timer !== null) clearTimeout(timer);
    written.dispose();
    resized.dispose();
    for (const m of marks) drop(m);
    marks = [];
  };
}

/** The band across a line the user sent. */
function bandOptions(
  colors: TerminalScheme['prompt'],
  cols: number,
): Omit<IDecorationOptions, 'marker'> {
  return {
    width: cols,
    layer: 'bottom',
    backgroundColor: colors.background,
    foregroundColor: colors.foreground,
    overviewRulerOptions: { color: colors.ruler, position: 'full' },
  };
}

function paintOptions(
  p: Paint,
  colors: PaintColors,
  cols: number,
): Omit<IDecorationOptions, 'marker'> {
  const c = colors[p.role];
  return {
    x: Math.min(p.x, cols - 1),
    width: Math.max(1, Math.min(p.width, cols - p.x)),
    layer: 'bottom',
    foregroundColor: c.foreground,
    ...(c.background ? { backgroundColor: c.background } : {}),
  };
}
