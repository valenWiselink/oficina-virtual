/**
 * A colour layer over what Claude Code writes, which arrives mostly in one
 * colour: the tool a step runs (`● Bash(`), the tool's output (`  ⎿` and what
 * hangs under it) dimmed, status lines (`✻ Cogitated…`, `※ recap`) dimmed,
 * the "Te toca:" line standing out, and list markers (`1.`, `-`) in the
 * accent. Pure: lines in, paints out (column, width, role); the terminal
 * draws them with the scheme's colours (terminalMarks.ts).
 */
export type PaintRole = 'tool' | 'dim' | 'yourTurn' | 'listMark';

export interface Paint {
  x: number;
  width: number;
  role: PaintRole;
}

/** What the line above left open: tool output or a "Te toca" still going. */
export type PaintCarry = 'none' | 'output' | 'yourTurn';

const TOOL_CALL = /^● ([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)?)\(/;
const TOOL_OUTPUT = /^ {2}⎿/;
const OUTPUT_HANG = /^ {4,}\S/;
const STATUS = /^[✻✶✳✢✽·※] /;
const YOUR_TURN = /^(?:● | {2})?Te toca:/;
const HANG = /^ {2}\S/;
const LIST_MARK = /^( {2,})(\d+\.|[-•]) /;

function whole(text: string, role: PaintRole): Paint[] {
  const width = text.trimEnd().length;
  return width > 0 ? [{ x: 0, width, role }] : [];
}

/** The paints of one line (not the user's) and what it leaves open. */
export function paintLine(text: string, carry: PaintCarry): { paints: Paint[]; carry: PaintCarry } {
  if (TOOL_OUTPUT.test(text)) return { paints: whole(text, 'dim'), carry: 'output' };
  if (carry === 'output' && OUTPUT_HANG.test(text)) {
    return { paints: whole(text, 'dim'), carry: 'output' };
  }
  if (YOUR_TURN.test(text) || (carry === 'yourTurn' && HANG.test(text))) {
    return { paints: whole(text, 'yourTurn'), carry: 'yourTurn' };
  }
  if (STATUS.test(text)) return { paints: whole(text, 'dim'), carry: 'none' };
  const tool = TOOL_CALL.exec(text);
  if (tool) return { paints: [{ x: 2, width: tool[1].length, role: 'tool' }], carry: 'none' };
  const list = LIST_MARK.exec(text);
  if (list) {
    return {
      paints: [{ x: list[1].length, width: list[2].length, role: 'listMark' }],
      carry: 'none',
    };
  }
  return { paints: [], carry: 'none' };
}

/** Paints for a run of lines; the user's own lines (`mine`) are left alone. */
export function paintLines(
  lines: readonly string[],
  mine: readonly boolean[],
  carry: PaintCarry = 'none',
): { paints: Paint[][]; carries: PaintCarry[] } {
  const paints: Paint[][] = [];
  const carries: PaintCarry[] = [];
  let open = carry;
  lines.forEach((text, i) => {
    if (mine[i]) {
      open = 'none';
      paints.push([]);
    } else {
      const r = paintLine(text, open);
      open = r.carry;
      paints.push(r.paints);
    }
    carries.push(open);
  });
  return { paints, carries };
}
