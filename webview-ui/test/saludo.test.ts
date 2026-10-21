import { describe, expect, it } from 'vitest';

import { dayMoments, emptyLine, localDay } from '../src/views/boardMood.js';
import {
  boardGreeting,
  BUSY_DAY_NOTE,
  greetingNote,
  isBestOfMonth,
  type NoteInput,
} from '../src/views/greetingRule.js';
import {
  achievedLine,
  achievedNow,
  EMPTY_PILE,
  type PileState,
  trackPile,
} from '../src/views/needsPile.js';
import { type DayRecord, recallParts } from '../src/views/officeMemory.js';
import { absenceEnded, AWAY_MS } from '../src/views/presence.js';
import { streakLength } from '../src/views/streak.js';
import { awaySummary, welcomeLine } from '../src/views/welcomeBack.js';

/** A local date at an hour, and its board day. */
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min);
const dayOf = (y: number, m: number, d: number) => localDay(at(y, m, d));

const rec = (tasks: number, merged = 0, turns = 0): DayRecord => ({
  tasks,
  turns,
  prs: merged,
  merged,
});

function note(date: Date, over: Partial<NoteInput> = {}): string | undefined {
  return greetingNote({
    hour: date.getHours(),
    today: localDay(date),
    moments: dayMoments(date),
    waiting: 0,
    records: {},
    ...over,
  });
}

describe('the greeting note: one rule, first that applies', () => {
  const tue = at(2026, 10, 20, 9); // a plain Tuesday morning
  const yesterday = { [String(dayOf(2026, 10, 19))]: rec(12, 3) };

  it('recalls the last day worked in the morning, with merges', () => {
    expect(note(tue, { records: yesterday })).toBe('ayer: 12 tareas y 3 PRs mergeados');
    expect(note(at(2026, 10, 20, 15), { records: yesterday })).toBeUndefined();
  });

  it('puts a busy "Te necesita" above everything', () => {
    expect(note(tue, { waiting: 4, records: yesterday })).toBe(BUSY_DAY_NOTE);
    expect(note(at(2026, 5, 25, 10), { waiting: 4 })).toBe(BUSY_DAY_NOTE);
    expect(note(tue, { waiting: 3, records: yesterday })).not.toBe(BUSY_DAY_NOTE);
  });

  it('keeps holidays and late nights above the recall', () => {
    expect(note(at(2026, 5, 25, 10), { records: yesterday })).toMatch(/25 de Mayo/);
    expect(note(at(2026, 10, 20, 23, 30), { records: yesterday })).toMatch(/tarde/);
  });

  it('on Monday morning recalls Friday', () => {
    const monday = at(2026, 10, 26, 9);
    const friday = { [String(dayOf(2026, 10, 23))]: rec(0, 3, 20) };
    expect(note(monday, { records: friday })).toBe(
      'lunes: arrancamos · el viernes cerraste con 20 turnos terminados y 3 PRs mergeados',
    );
    expect(note(monday)).toBe('lunes: arrancamos');
  });

  it('lets Friday and month end win over a plain recall, not over your best day', () => {
    const friday = at(2026, 10, 23, 9);
    const thursday = dayOf(2026, 10, 22);
    expect(note(friday, { records: { [String(thursday)]: rec(5) } })).toMatch(/viernes/);
    const month: Record<string, DayRecord> = {};
    for (let i = 1; i <= 12; i++) month[String(thursday - i)] = rec(4, 1);
    month[String(thursday)] = rec(9, 1);
    expect(note(friday, { records: month })).toBe(
      'ayer: 9 tareas y 1 PR mergeado · tu mejor día del mes',
    );
  });
});

describe('isBestOfMonth', () => {
  const day = 1000;
  const month = (best: DayRecord, others = 12): Record<string, DayRecord> => {
    const r: Record<string, DayRecord> = { [String(day)]: best };
    for (let i = 1; i <= others; i++) r[String(day - i)] = rec(5, 2);
    return r;
  };

  it('needs to beat every day before it, in tasks or in merges', () => {
    expect(isBestOfMonth(month(rec(6, 0)), day)).toBe(true);
    expect(isBestOfMonth(month(rec(1, 3)), day)).toBe(true);
    expect(isBestOfMonth(month(rec(5, 2)), day)).toBe(false); // a tie is not best
  });

  it('says nothing with fewer than 10 days remembered', () => {
    expect(isBestOfMonth(month(rec(9, 9), 8), day)).toBe(false);
  });

  it('ignores today and days older than a month', () => {
    const r = month(rec(6, 0));
    r[String(day + 1)] = rec(50, 50);
    r[String(day - 40)] = rec(50, 50);
    expect(isBestOfMonth(r, day)).toBe(true);
  });
});

describe('recallParts', () => {
  it('prefers merges to PRs left for you, and turns only without tasks', () => {
    expect(recallParts({ tasks: 12, turns: 30, prs: 3 })).toBe('12 tareas y 3 PRs');
    expect(recallParts(rec(1, 1, 4))).toBe('1 tarea y 1 PR mergeado');
    expect(recallParts(rec(0, 0, 0))).toBeUndefined();
  });
});

describe('the whole line', () => {
  const base = {
    hour: 10,
    today: dayOf(2026, 10, 21),
    moments: dayMoments(at(2026, 10, 21)),
    waiting: 1,
    records: {},
    name: 'Valentín',
    counts: { needs: 1, work: 2, done: 0, idle: 0 },
  };

  it('greets with your name and the office at a glance', () => {
    const line = boardGreeting(base);
    expect(line.title).toBe('Buen día, Valentín');
    expect(line.summary).toBe('2 trabajando · 1 te espera');
    expect(line.welcome).toBe(false);
  });

  it('gives the whole line to «Volviste» while it lasts', () => {
    const line = boardGreeting({
      ...base,
      waiting: 5,
      welcome: { title: 'Volviste, Valentín', text: 'mientras tanto: 2 terminaron' },
    });
    expect(line).toMatchObject({
      title: 'Volviste, Valentín',
      note: 'mientras tanto: 2 terminaron',
      welcome: true,
    });
    expect(line.summary).toBeUndefined();
  });
});

describe('absence', () => {
  const t = at(2026, 10, 21, 12, 18).getTime();

  it('counts from 45 min without touching the office', () => {
    expect(absenceEnded(t, t + AWAY_MS - 1)).toBeNull();
    expect(absenceEnded(t, t + 90 * 60_000)).toEqual({ from: t, to: t + 90 * 60_000 });
  });

  it('never for one that started another day (that is the morning’s «ayer»)', () => {
    const evening = at(2026, 10, 20, 19).getTime();
    expect(absenceEnded(evening, at(2026, 10, 21, 9).getTime())).toBeNull();
  });
});

describe('«Volviste»', () => {
  const e = (at: number, kind: string, agent: string, agentId?: number, prUrl?: string) => ({
    at,
    kind,
    agent,
    agentId,
    prUrl,
  });
  const entries = [
    e(5, 'termino', 'Pagos', 1),
    e(15, 'termino', 'Pagos', 1),
    e(16, 'tarea', 'Pagos', 1),
    e(20, 'tetoca', 'Langostino', 2),
    e(30, 'termino', 'Catálogo', 3),
    e(31, 'termino', 'OpenApi', 4),
    e(40, 'mergeado', 'Langostino', 2, 'u1'),
    e(41, 'mergeado', 'Langostino', 2, 'u1'),
    e(99, 'termino', 'Tarde', 5),
  ];

  it('says what happened while you were away, starting with who waits', () => {
    const s = awaySummary(entries, 10, 50, false)!;
    expect(s).toMatchObject({ leftYou: ['Langostino'], finished: 3, merged: 1, allDone: false });
    expect(s.agentIds.sort()).toEqual([1, 2, 3, 4]);
    expect(welcomeLine(s, 'Valentín', 16)).toEqual({
      title: 'Volviste, Valentín',
      text: 'mientras tanto: Langostino te dejó algo, 3 terminaron y se mergeó 1 PR',
    });
  });

  it('asks about lunch between 13 and 15, and tells a «Terminaron todos» you missed', () => {
    const s = awaySummary(entries, 28, 32, true)!;
    expect(welcomeLine(s, '', 13)).toEqual({
      title: '¿Qué tal el almuerzo?',
      text: 'mientras tanto: terminaron todos',
    });
  });

  it('stays out when nothing happened', () => {
    expect(awaySummary(entries, 50, 90, false)).toBeNull();
  });
});

describe('«Al día»', () => {
  const office = new Set([1, 2, 3, 4]);
  const run = (steps: Array<[number[], number, Set<number>?]>, from: PileState = EMPTY_PILE) =>
    steps.reduce(
      (s, [waiting, now, present]) => trackPile(s, waiting, present ?? office, now),
      from,
    );

  it('notices a pile of 3 answered down to none, once it stays empty 5 s', () => {
    const cleared = run([
      [[1, 2, 3], 0],
      [[2, 3], 10_000],
      [[3], 20_000],
      [[], 30_000],
    ]);
    expect(cleared.earnedAt).toBeUndefined(); // empty for less than 5 s
    const settled = trackPile(cleared, [], office, 35_000);
    expect(settled.earnedAt).toBe(35_000);
    expect(achievedNow(settled, 36_000)).toBe(true);
    expect(achievedNow(settled, 35_000 + 10 * 60_000)).toBe(false);
    expect(achievedLine(35_000)).toBe(achievedLine(35_000));
  });

  it('does not count agents you closed, nor a column empty for less than 5 s', () => {
    const closed = run([
      [[1, 2, 3], 0],
      [[], 1_000, new Set([4])],
      [[], 10_000, new Set([4])],
    ]);
    expect(closed.earnedAt).toBeUndefined();
    const blip = run([
      [[1, 2, 3], 0],
      [[], 1_000],
      [[4], 3_000],
      [[], 4_000],
      [[], 9_500],
    ]);
    // The blip did not end the stretch: 3 answered + 1 more, settled at 9.5 s.
    expect(blip.earnedAt).toBe(9_500);
  });

  it('needs 3 at once, and waits 30 min for the next', () => {
    const small = run([
      [[1, 2], 0],
      [[], 1_000],
      [[], 7_000],
    ]);
    expect(small.earnedAt).toBeUndefined();
    const first = run([
      [[1, 2, 3], 0],
      [[], 1_000],
      [[], 7_000],
    ]);
    const again = run(
      [
        [[1, 2, 3], 60_000],
        [[], 61_000],
        [[], 67_000],
      ],
      first,
    );
    expect(again.earnedAt).toBe(7_000);
  });
});

describe('the streak counts working days', () => {
  const monday = dayOf(2026, 10, 26);
  const week = [19, 20, 21, 22, 23].map((d) => dayOf(2026, 10, d));

  it('a weekend does not break it: Monday says 5 before closing', () => {
    expect(streakLength(week, monday)).toBe(5);
    expect(streakLength([...week, monday], monday)).toBe(6);
  });

  it('a fixed holiday does not break it either, a working day does', () => {
    // Tue 8 Dec 2026 is a holiday: Mon 7 and Wed 9 are consecutive.
    const days = [dayOf(2026, 12, 7), dayOf(2026, 12, 9)];
    expect(streakLength(days, dayOf(2026, 12, 9))).toBe(2);
    expect(streakLength([dayOf(2026, 10, 19), dayOf(2026, 10, 21)], dayOf(2026, 10, 21))).toBe(1);
  });

  it('a clean weekend day still counts', () => {
    expect(streakLength([...week, dayOf(2026, 10, 24)], dayOf(2026, 10, 25))).toBe(6);
  });
});

describe('empty columns', () => {
  it('change with the hour as well as the day', () => {
    const day = 100;
    const lines = new Set([9, 13, 16, 21].map((h) => emptyLine('needs', day, h)));
    expect(lines.size).toBe(4);
    expect(emptyLine('needs', day, 9)).toBe(emptyLine('needs', day, 10));
  });

  it('never talk about speed or counts', () => {
    for (const col of ['needs', 'work', 'done', 'idle'] as const) {
      for (let d = 0; d < 8; d++) {
        for (const h of [9, 13, 16, 21]) expect(emptyLine(col, d, h)).not.toMatch(/\d|rápid/);
      }
    }
  });
});
