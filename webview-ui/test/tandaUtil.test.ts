import { describe, expect, it } from 'vitest';

import type { DayLogEntry, PrStatus } from '../../core/src/messages.js';
import { collectPrs, shortPr } from '../src/history/prRows.js';
import type { AgentView } from '../src/views/agentViews.js';
import { isImpatient, offersCompact, offersQuickReplies } from '../src/views/cardRules.js';
import { yesterdayLine } from '../src/views/officeMemory.js';
import { closesClean, streakLength } from '../src/views/streak.js';

const view = (over: Partial<AgentView>) =>
  ({ id: 1, name: 'Pagos', kind: 'done', tasks: [], subagents: [], ...over }) as AgentView;

describe('quick replies and compact', () => {
  it('fit a finished turn or a "te toca", never a held permission', () => {
    expect(offersQuickReplies(view({ kind: 'done' }), true)).toBe(true);
    expect(offersQuickReplies(view({ kind: 'needs', yourTurnId: 't' }), true)).toBe(true);
    expect(offersQuickReplies(view({ kind: 'needs', blocking: true }), true)).toBe(false);
    expect(offersQuickReplies(view({ kind: 'done' }), false)).toBe(false);
  });

  it('offer "Compactar" from 85% of context', () => {
    expect(offersCompact(view({ contextPct: 90 }), true)).toBe(true);
    expect(offersCompact(view({ contextPct: 60 }), true)).toBe(false);
  });

  it('call an agent impatient after 10 min waiting', () => {
    expect(isImpatient(view({ kind: 'needs', waitingSince: 0 }), 11 * 60_000)).toBe(true);
    expect(isImpatient(view({ kind: 'needs', waitingSince: 0 }), 5 * 60_000)).toBe(false);
  });
});

describe('streak', () => {
  it('counts the day clean only in the evening, with work done and nobody waiting', () => {
    expect(closesClean(18, 3, 0)).toBe(true);
    expect(closesClean(12, 3, 0)).toBe(false);
    expect(closesClean(18, 0, 0)).toBe(false);
  });

  it('counts consecutive clean days up to today or yesterday', () => {
    expect(streakLength([8, 9, 10], 10)).toBe(3);
    expect(streakLength([8, 9], 10)).toBe(2);
    expect(streakLength([7, 9], 10)).toBe(1);
    expect(streakLength([], 10)).toBe(0);
  });
});

describe('yesterdayLine', () => {
  it('recalls tasks and PRs', () => {
    expect(yesterdayLine({ tasks: 12, turns: 30, prs: 3 })).toBe('ayer: 12 tareas y 3 PRs');
    expect(yesterdayLine(undefined)).toBeUndefined();
  });
});

describe('collectPrs', () => {
  it('lists each PR once, open ones first, with GitHub state', () => {
    const a = 'https://github.com/o/web/pull/1';
    const b = 'https://github.com/o/api/pull/2';
    const statuses = new Map<string, PrStatus>([
      [a, { url: a, state: 'merged', title: 'Arreglo' }],
      [b, { url: b, state: 'open' }],
    ]);
    const entries = [{ at: 0, kind: 'tetoca', agent: 'Api', text: '', prUrl: b }] as DayLogEntry[];
    const rows = collectPrs([view({ prUrl: a })], entries, statuses);
    expect(rows.map((r) => r.url)).toEqual([b, a]);
    expect(rows[1].title).toBe('Arreglo');
    expect(shortPr(a)).toBe('web#1');
  });
});
