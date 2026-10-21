import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DayLogEntry } from '../../core/src/messages.js';
import { tally, weekRecap } from '../src/weekRecap.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-week-'));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (kind: DayLogEntry['kind'], extra: Partial<DayLogEntry> = {}): DayLogEntry => ({
  at: 0,
  agent: 'Langostino',
  kind,
  text: kind,
  ...extra,
});

function writeDay(day: string, entries: DayLogEntry[], junk = ''): void {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(path.join(dir, `historial-${day}.jsonl`), `${lines}\n${junk}`);
}

describe('tally', () => {
  it('counts tasks, turns and distinct merged PRs, nothing else', () => {
    expect(
      tally([
        entry('tarea'),
        entry('tarea'),
        entry('termino'),
        entry('permiso'),
        entry('respuesta'),
        entry('mergeado', { prUrl: 'https://github.com/o/r/pull/1' }),
        entry('mergeado', { prUrl: 'https://github.com/o/r/pull/1' }),
        entry('mergeado', { prUrl: 'https://github.com/o/r/pull/2' }),
        entry('tetoca', { prUrl: 'https://github.com/o/r/pull/3' }),
      ]),
    ).toEqual({ tasks: 2, turns: 1, merged: 2 });
  });
});

describe('weekRecap', () => {
  it('reads Monday to Friday, a missing day as zero, and skips broken lines', () => {
    writeDay('2026-10-19', [entry('tarea'), entry('termino')]);
    writeDay('2026-10-21', [entry('mergeado', { prUrl: 'u1' })], '{not json\n');
    writeDay('2026-10-24', [entry('tarea')]); // Saturday: not part of it
    const recap = weekRecap(dir, '2026-10-19');
    expect(recap?.monday).toBe('2026-10-19');
    expect(recap?.days).toEqual([
      { day: '2026-10-19', tasks: 1, turns: 1, merged: 0 },
      { day: '2026-10-20', tasks: 0, turns: 0, merged: 0 },
      { day: '2026-10-21', tasks: 0, turns: 0, merged: 1 },
      { day: '2026-10-22', tasks: 0, turns: 0, merged: 0 },
      { day: '2026-10-23', tasks: 0, turns: 0, merged: 0 },
    ]);
  });

  it('crosses a month end', () => {
    expect(weekRecap(dir, '2026-09-28')?.days.map((d) => d.day)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('refuses anything that is not a real date (it names files)', () => {
    for (const bad of ['../../x', '2026-13-01', '2026-02-30', '20261019', 42, undefined]) {
      expect(weekRecap(dir, bad)).toBeNull();
    }
  });
});
