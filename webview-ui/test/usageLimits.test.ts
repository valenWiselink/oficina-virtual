import { describe, expect, it } from 'vitest';

import {
  formatObserved,
  formatReset,
  formatSpan,
  limitLevel,
  limitsTitle,
  limitViews,
  readLimitsMessage,
  type UsageLimits,
  windowView,
  worstView,
} from '../src/limits/usageLimits.js';

// Local-time dates, so the clock text does not depend on the machine's zone.
const NOW = new Date(2026, 9, 21, 16, 25).getTime(); // Wednesday 21/10 16:25
const sec = (d: Date) => d.getTime() / 1000;
const MIN = 60_000;

describe('limitLevel', () => {
  it('is calm below 80, amber from 80, red from 95', () => {
    expect(limitLevel(0)).toBe('ok');
    expect(limitLevel(79)).toBe('ok');
    expect(limitLevel(80)).toBe('warn');
    expect(limitLevel(94)).toBe('warn');
    expect(limitLevel(95)).toBe('danger');
    expect(limitLevel(100)).toBe('danger');
  });
});

describe('formatSpan', () => {
  it('rounds up to the minute and drops a zero part', () => {
    expect(formatSpan(30_000)).toBe('menos de un minuto');
    expect(formatSpan(25 * MIN)).toBe('25 min');
    expect(formatSpan(24 * MIN + 1)).toBe('25 min');
    expect(formatSpan(135 * MIN)).toBe('2 h 15 min');
    expect(formatSpan(180 * MIN)).toBe('3 h');
  });
});

describe('formatReset', () => {
  it('within the session: how long and at what time', () => {
    expect(formatReset(sec(new Date(2026, 9, 21, 18, 40)), NOW)).toBe(
      'se reinicia en 2 h 15 min (a las 18:40)',
    );
  });

  it('later today, tomorrow, or a weekday for the week', () => {
    const early = new Date(2026, 9, 21, 6, 0).getTime();
    expect(formatReset(sec(new Date(2026, 9, 21, 22, 0)), early)).toBe(
      'se reinicia hoy a las 22:00',
    );
    expect(formatReset(sec(new Date(2026, 9, 22, 9, 0)), NOW)).toBe(
      'se reinicia mañana a las 09:00',
    );
    expect(formatReset(sec(new Date(2026, 9, 24, 9, 0)), NOW)).toBe(
      'se reinicia el sábado a las 09:00',
    );
  });

  it('once past, says when it reset', () => {
    expect(formatReset(sec(new Date(2026, 9, 21, 15, 0)), NOW)).toBe('se reinició a las 15:00');
  });
});

describe('windowView', () => {
  const later = sec(new Date(2026, 9, 21, 18, 40));

  it('rounds and clamps the percentage', () => {
    expect(windowView('5 h', { usedPercentage: 23.5, resetsAt: later }, NOW).pct).toBe(24);
    expect(windowView('5 h', { usedPercentage: 104, resetsAt: later }, NOW)).toMatchObject({
      pct: 100,
      level: 'danger',
    });
  });

  it('no window is no data, not zero', () => {
    expect(windowView('Semana', undefined, NOW)).toEqual({
      label: 'Semana',
      pct: null,
      level: 'ok',
      reset: null,
    });
  });

  it('a window past its reset reads 0 % and says it reset', () => {
    const past = sec(new Date(2026, 9, 21, 15, 0));
    expect(windowView('5 h', { usedPercentage: 97, resetsAt: past }, NOW)).toEqual({
      label: '5 h',
      pct: 0,
      level: 'ok',
      reset: 'se reinició a las 15:00',
    });
  });
});

describe('worstView', () => {
  it('picks the window closest to its limit, ignoring missing ones', () => {
    const msg: UsageLimits = {
      type: 'usageLimits',
      setup: 'ours',
      fiveHour: { usedPercentage: 30, resetsAt: sec(new Date(2026, 9, 21, 18, 0)) },
      sevenDay: { usedPercentage: 85, resetsAt: sec(new Date(2026, 9, 24, 9, 0)) },
    };
    expect(worstView(limitViews(msg, NOW))).toMatchObject({ label: 'Semana', pct: 85 });
    expect(worstView(limitViews({ type: 'usageLimits', setup: 'ours' }, NOW))).toBeNull();
  });
});

describe('formatObserved', () => {
  it('recién, minutes, hours, days', () => {
    expect(formatObserved(undefined, NOW)).toBeNull();
    expect(formatObserved(NOW - 30_000, NOW)).toBe('actualizado recién');
    expect(formatObserved(NOW - 12 * MIN, NOW)).toBe('actualizado hace 12 min');
    expect(formatObserved(NOW - 3 * 60 * MIN, NOW)).toBe('actualizado hace 3 h');
    expect(formatObserved(NOW - 72 * 60 * MIN, NOW)).toBe('actualizado hace 3 días');
  });
});

describe('limitsTitle', () => {
  it('one line per window plus freshness', () => {
    const msg: UsageLimits = {
      type: 'usageLimits',
      setup: 'ours',
      observedAt: NOW - 5 * MIN,
      fiveHour: { usedPercentage: 23, resetsAt: sec(new Date(2026, 9, 21, 18, 40)) },
    };
    expect(limitsTitle(msg, NOW)).toBe(
      [
        'Sesión (5 h): 23 % · se reinicia en 2 h 15 min (a las 18:40)',
        'Semana: sin dato',
        '(actualizado hace 5 min)',
      ].join('\n'),
    );
  });

  it('says there is no data while off or before the first numbers', () => {
    expect(limitsTitle(null, NOW)).toBe('Tus límites de Claude: sin dato');
    expect(limitsTitle({ type: 'usageLimits', setup: 'off' }, NOW)).toBe(
      'Tus límites de Claude: sin dato',
    );
    expect(limitsTitle({ type: 'usageLimits', setup: 'ours' }, NOW)).toContain('sin dato todavía');
  });
});

describe('readLimitsMessage', () => {
  it('takes usageLimits messages only', () => {
    expect(readLimitsMessage({ type: 'usageLimits', setup: 'off' })).toEqual({
      type: 'usageLimits',
      setup: 'off',
    });
    expect(readLimitsMessage({ type: 'usageLimits' })).toBeNull();
    expect(readLimitsMessage({ type: 'prStatus' })).toBeNull();
  });
});
