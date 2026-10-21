import { describe, expect, it } from 'vitest';

import {
  mergeLimits,
  newerWindow,
  parseLimitsSnapshot,
  rateLimitsFromStatusLine,
  statusLineText,
} from '../src/usageLimits/rateLimits.js';

const HOUR = 3600;
const NOW = 1_800_000_000_000; // ms
const NOW_SEC = NOW / 1000;

describe('rateLimitsFromStatusLine', () => {
  it('reads both windows from the documented shape', () => {
    const input = {
      model: { display_name: 'Opus' },
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
        seven_day: { used_percentage: 41.2, resets_at: 1738857600 },
        spend_limit: { used_percentage: 62.8, resets_at: 1740787200 },
      },
    };
    expect(rateLimitsFromStatusLine(input)).toEqual({
      fiveHour: { usedPercentage: 23.5, resetsAt: 1738425600 },
      sevenDay: { usedPercentage: 41.2, resetsAt: 1738857600 },
    });
  });

  it('keeps a window that comes alone (each may be absent)', () => {
    const input = { rate_limits: { seven_day: { used_percentage: 5, resets_at: 1738857600 } } };
    expect(rateLimitsFromStatusLine(input)).toEqual({
      sevenDay: { usedPercentage: 5, resetsAt: 1738857600 },
    });
  });

  it('is null without limits: API key, first response not in yet, garbage', () => {
    expect(rateLimitsFromStatusLine({ model: {} })).toBeNull();
    expect(rateLimitsFromStatusLine({ rate_limits: {} })).toBeNull();
    expect(rateLimitsFromStatusLine({ rate_limits: { five_hour: { used_percentage: 'x' } } })).toBe(
      null,
    );
    expect(rateLimitsFromStatusLine({ rate_limits: { five_hour: { used_percentage: 3 } } })).toBe(
      null,
    );
    expect(rateLimitsFromStatusLine(null)).toBeNull();
    expect(rateLimitsFromStatusLine('nope')).toBeNull();
  });
});

describe('newerWindow', () => {
  const w = (usedPercentage: number, resetsAt: number) => ({ usedPercentage, resetsAt });

  it('a later window wins even with less use (the old one reset)', () => {
    expect(newerWindow(w(90, NOW_SEC), w(3, NOW_SEC + 5 * HOUR))).toEqual(w(3, NOW_SEC + 5 * HOUR));
    expect(newerWindow(w(3, NOW_SEC + 5 * HOUR), w(90, NOW_SEC))).toEqual(w(3, NOW_SEC + 5 * HOUR));
  });

  it('within one window the higher use wins: a stale session re-running loses', () => {
    expect(newerWindow(w(40, NOW_SEC), w(25, NOW_SEC))).toEqual(w(40, NOW_SEC));
    // A few seconds of drift in resets_at is still the same window.
    expect(newerWindow(w(40, NOW_SEC), w(45, NOW_SEC + 2))).toEqual(w(45, NOW_SEC + 2));
  });

  it('takes whichever exists', () => {
    expect(newerWindow(undefined, w(1, 2))).toEqual(w(1, 2));
    expect(newerWindow(w(1, 2), undefined)).toEqual(w(1, 2));
    expect(newerWindow(undefined, undefined)).toBeUndefined();
  });
});

describe('mergeLimits', () => {
  const five = (used: number) => ({ usedPercentage: used, resetsAt: NOW_SEC + HOUR });
  const week = (used: number) => ({ usedPercentage: used, resetsAt: NOW_SEC + 72 * HOUR });

  it('starts the file from the first report', () => {
    expect(mergeLimits(null, { fiveHour: five(10) }, NOW)).toEqual({
      observedAt: NOW,
      fiveHour: five(10),
    });
  });

  it('keeps a window the report does not carry', () => {
    const prev = { observedAt: NOW - 1000, fiveHour: five(10), sevenDay: week(30) };
    expect(mergeLimits(prev, { fiveHour: five(12) }, NOW)).toEqual({
      observedAt: NOW,
      fiveHour: five(12),
      sevenDay: week(30),
    });
  });

  it('a stale report changes nothing, not even the freshness', () => {
    const prev = { observedAt: NOW - 60_000, fiveHour: five(50), sevenDay: week(30) };
    expect(mergeLimits(prev, { fiveHour: five(20), sevenDay: week(28) }, NOW)).toEqual(prev);
  });
});

describe('parseLimitsSnapshot', () => {
  it('reads back what mergeLimits wrote', () => {
    const snap = mergeLimits(null, { fiveHour: { usedPercentage: 7, resetsAt: NOW_SEC } }, NOW);
    expect(parseLimitsSnapshot(JSON.stringify(snap))).toEqual(snap);
  });

  it('is null for anything else', () => {
    expect(parseLimitsSnapshot('')).toBeNull();
    expect(parseLimitsSnapshot('{"fiveHour":{}}')).toBeNull();
    expect(parseLimitsSnapshot('[1]')).toBeNull();
  });

  it('drops a malformed window but keeps the rest', () => {
    const raw = JSON.stringify({ observedAt: NOW, fiveHour: { usedPercentage: 'x' } });
    expect(parseLimitsSnapshot(raw)).toEqual({ observedAt: NOW });
  });
});

describe('statusLineText', () => {
  it('says both windows in a short line', () => {
    const limits = {
      fiveHour: { usedPercentage: 23.5, resetsAt: NOW_SEC + HOUR },
      sevenDay: { usedPercentage: 41.2, resetsAt: NOW_SEC + 9 * HOUR },
    };
    expect(statusLineText(limits, NOW)).toBe('5 h: 24 % · semana: 41 %');
  });

  it('leaves out a window that already reset, and is empty with nothing', () => {
    const limits = {
      fiveHour: { usedPercentage: 99, resetsAt: NOW_SEC - 1 },
      sevenDay: { usedPercentage: 41, resetsAt: NOW_SEC + HOUR },
    };
    expect(statusLineText(limits, NOW)).toBe('semana: 41 %');
    expect(statusLineText({}, NOW)).toBe('');
  });
});
