import { describe, expect, it } from 'vitest';

import type { DayLogEntry } from '../../core/src/messages.js';
import { isNightHour } from '../src/effects/dayPhase.js';
import { daySummary, summaryLine } from '../src/history/dayLogView.js';
import { NICKNAMES, rollNickname } from '../src/launch/nicknames.js';
import type { AgentView } from '../src/views/agentViews.js';
import { dayNote } from '../src/views/boardMood.js';
import { diffMotions } from '../src/views/cardMotion.js';
import { allFinished } from '../src/views/officeMoments.js';

const view = (id: number, kind: AgentView['kind']) => ({ id, kind }) as AgentView;

describe('dayNote', () => {
  it('knows fixed holidays, Fridays and late nights', () => {
    expect(dayNote(new Date(2026, 4, 25, 10))).toMatch(/25 de Mayo/);
    expect(dayNote(new Date(2026, 9, 23, 10))).toMatch(/viernes/);
    expect(dayNote(new Date(2026, 9, 21, 23, 30))).toMatch(/tarde/);
    expect(dayNote(new Date(2026, 9, 31, 10))).toMatch(/fin de mes/);
  });

  it("knows Programmers' Day (the 256th day)", () => {
    expect(dayNote(new Date(2026, 8, 13, 10))).toMatch(/programador/);
  });

  it('says nothing on a plain day', () => {
    expect(dayNote(new Date(2026, 9, 21, 10))).toBeUndefined();
  });
});

describe('diffMotions', () => {
  it('moves nothing on the first look', () => {
    expect(diffMotions(null, [view(1, 'work')]).size).toBe(0);
  });

  it('pops a new agent in and hops one that starts needing you', () => {
    const before = new Map<number, AgentView['kind']>([[1, 'work']]);
    const motions = diffMotions(before, [view(1, 'needs'), view(2, 'idle')]);
    expect(motions.get(1)).toBe('hop');
    expect(motions.get(2)).toBe('pop');
  });
});

describe('allFinished', () => {
  it('needs someone busy before and nobody busy or waiting now', () => {
    expect(allFinished(true, [view(1, 'done'), view(2, 'idle')])).toBe(true);
    expect(allFinished(false, [view(1, 'done')])).toBe(false);
    expect(allFinished(true, [view(1, 'done'), view(2, 'needs')])).toBe(false);
    expect(allFinished(true, [view(1, 'work')])).toBe(false);
  });
});

describe('daySummary', () => {
  it('counts the day and finds who finished the most', () => {
    const e = (kind: DayLogEntry['kind'], agent: string, prUrl?: string): DayLogEntry => ({
      at: 0,
      kind,
      agent,
      text: '',
      prUrl,
    });
    const s = daySummary([
      e('tarea', 'Pagos'),
      e('tarea', 'Pagos'),
      e('termino', 'Web'),
      e('tetoca', 'Web', 'https://x/pr/1'),
    ]);
    expect(s.tasks).toBe(2);
    expect(s.star?.agent).toBe('Pagos');
    expect(summaryLine(s)).toBe('2 tareas · 1 turno terminado · 1 PR');
  });
});

describe('rollNickname', () => {
  it('never repeats the name in the field', () => {
    for (let r = 0; r < 1; r += 0.05) expect(rollNickname(r, NICKNAMES[0])).not.toBe(NICKNAMES[0]);
  });
});

describe('isNightHour', () => {
  it('is dark from 20 to 7', () => {
    expect(isNightHour(21)).toBe(true);
    expect(isNightHour(6)).toBe(true);
    expect(isNightHour(7)).toBe(false);
    expect(isNightHour(19)).toBe(false);
  });
});
