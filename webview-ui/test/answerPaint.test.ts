import { describe, expect, it } from 'vitest';

import { paintLines } from '../src/terminal/answerPaint.js';

const roles = (lines: string[], mine: boolean[] = lines.map(() => false)) =>
  paintLines(lines, mine).paints.map((ps) => ps.map((p) => p.role).join(',') || '-');

describe('paintLines', () => {
  it('colours the tool name and dims its output, hanging lines included', () => {
    const lines = [
      '● Bash(gh pr view 106 --json state)',
      '  ⎿  {',
      '       "mergeCommit": {',
      '     … +34 lines (ctrl+o to expand)',
      '',
      '● Bien. La PR 106 ya está mergeada.',
    ];
    expect(roles(lines)).toEqual(['tool', 'dim', 'dim', 'dim', '-', '-']);
    expect(
      paintLines(
        lines,
        lines.map(() => false),
      ).paints[0][0],
    ).toEqual({
      x: 2,
      width: 4,
      role: 'tool',
    });
  });

  it('makes "Te toca" stand out, wrapped lines too', () => {
    expect(
      roles([
        '  Te toca: cuando termine el build, elegir la build nueva en la 1.1',
        '  de App Store Connect',
        '',
      ]),
    ).toEqual(['yourTurn', 'yourTurn', '-']);
  });

  it('dims status lines and marks list numbers', () => {
    expect(
      roles([
        '✻ Cogitated for 27s · done 21:54',
        '※ recap: estamos publicando',
        '  1. Apple tarda',
      ]),
    ).toEqual(['dim', 'dim', 'listMark']);
  });

  it("leaves the user's own lines alone", () => {
    expect(roles(['❯ 1. hacé esto', '● Listo.'], [true, false])).toEqual(['-', '-']);
  });
});
