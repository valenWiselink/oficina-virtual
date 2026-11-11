import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { DayLogEntry } from '../../core/src/messages.ts';
import {
  activityOf,
  baseMoment,
  currentMoment,
  handOf,
  meetingNote,
  type MomentContext,
  momentLabel,
  momentReason,
  readChoice,
  swipeOf,
  urgentInMeeting,
} from '../src/asistente/asistenteRules.ts';

describe('a swipe on a card', () => {
  it('sideways and far enough; a tap or a scroll is nothing', () => {
    assert.equal(swipeOf(120, 10), 'right');
    assert.equal(swipeOf(-95, 20), 'left');
    assert.equal(swipeOf(40, 0), undefined);
    assert.equal(swipeOf(90, 140), undefined);
  });
});

const MIN = 60_000;
/** Wednesday 11 November 2026 at that local time. */
const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m).getTime();
const NOW = at(16);
const PASE = { title: 'Pase de seguridad con Gian', start: at(15, 50), end: at(16, 20) };
const ctx = (over: Partial<MomentContext> = {}): MomentContext => ({
  now: NOW,
  meetings: [],
  waiting: 0,
  typing: false,
  ...over,
});
const entry = (agent: string, minutesAgo: number): DayLogEntry => ({
  at: NOW - minutesAgo * MIN,
  agent,
  kind: 'respuesta',
  text: '…',
});

describe('the moment the office picks', () => {
  it('a meeting under way is «Reunión», whatever waits', () => {
    assert.equal(baseMoment(ctx({ meetings: [PASE], waiting: 3 })), 'reunion');
  });

  it('a meeting marked «sin aviso» does not count', () => {
    assert.equal(baseMoment(ctx({ meetings: [{ ...PASE, quiet: true }] })), 'escribir');
  });

  it('from 19:00 it is «Cierre del día»', () => {
    assert.equal(baseMoment(ctx({ now: at(19, 5), waiting: 2 })), 'cierre');
    assert.equal(baseMoment(ctx({ now: at(18, 59), waiting: 2 })), 'decidir');
  });

  it('something waiting is «Decidir»; nothing is «Escribir»', () => {
    assert.equal(baseMoment(ctx({ waiting: 1 })), 'decidir');
    assert.equal(baseMoment(ctx()), 'escribir');
  });

  it('writing folds it into «Escribir», except in a meeting (you write notes there)', () => {
    assert.equal(currentMoment(ctx({ waiting: 2, typing: true }), undefined), 'escribir');
    assert.equal(currentMoment(ctx({ meetings: [PASE], typing: true }), undefined), 'reunion');
  });
});

describe('a moment chosen by hand', () => {
  it('holds while the situation is the same, typing included', () => {
    const choice = { moment: 'decidir' as const, base: 'escribir' as const };
    assert.equal(currentMoment(ctx(), choice), 'decidir');
    assert.equal(currentMoment(ctx({ typing: true }), choice), 'decidir');
  });

  it('gives way when the situation changes (a meeting starts)', () => {
    const choice = { moment: 'escribir' as const, base: 'decidir' as const };
    assert.equal(currentMoment(ctx({ waiting: 2 }), choice), 'escribir');
    assert.equal(currentMoment(ctx({ waiting: 2, meetings: [PASE] }), choice), 'reunion');
  });

  it('is remembered as JSON; junk or an old plain moment is nothing', () => {
    assert.deepEqual(readChoice('{"moment":"cierre","base":"decidir"}'), {
      moment: 'cierre',
      base: 'decidir',
    });
    assert.equal(readChoice('escribir'), undefined);
    assert.equal(readChoice('{"moment":"siesta","base":"decidir"}'), undefined);
    assert.equal(readChoice(null), undefined);
  });
});

describe('what the moment bar says', () => {
  it('names and reasons', () => {
    assert.equal(momentLabel('decidir', 3), 'Decidir · 3');
    assert.equal(momentLabel('reunion', 3), 'Reunión');
    assert.equal(momentLabel('cierre', 0), 'Cierre del día');
    assert.equal(
      momentReason('reunion', ctx({ meetings: [PASE] }), false),
      'En reunión hasta las 16:20',
    );
    assert.equal(momentReason('decidir', ctx({ waiting: 1 }), false), 'Te espera una decisión');
    assert.equal(momentReason('decidir', ctx({ waiting: 1 }), true), undefined);
  });
});

describe('in a meeting', () => {
  it('only what holds someone back or is due by its end shows', () => {
    assert.equal(urgentInMeeting({ blocks: ['pase'], times: {} }, PASE), true);
    assert.equal(urgentInMeeting({ blocks: [], times: { due: at(16, 30) } }, PASE), true);
    assert.equal(urgentInMeeting({ blocks: [], times: { due: at(18) } }, PASE), false);
    assert.equal(urgentInMeeting({ blocks: [], times: {} }, PASE), false);
  });

  it('what you write goes as a note of it', () => {
    assert.equal(
      meetingNote(PASE, 'Gian quiere el reporte el viernes'),
      '[Nota de la reunión «Pase de seguridad con Gian»] Gian quiere el reporte el viernes',
    );
  });
});

describe('how busy an agent was', () => {
  it('six buckets of five minutes, oldest first, only its own lines', () => {
    const log = [
      entry('pase', 2),
      entry('pase', 3),
      entry('pase', 12),
      entry('pase', 29),
      entry('pase', 45), // older than half an hour
      entry('login', 1),
    ];
    assert.deepEqual(activityOf(log, 'pase', NOW), [1, 0, 0, 1, 0, 2]);
    assert.deepEqual(activityOf(log, 'nadie', NOW), [0, 0, 0, 0, 0, 0]);
  });
});

describe('the hand of cards', () => {
  it('three in sight, the rest counted; all when asked', () => {
    const waiting = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(handOf(waiting, false), { shown: ['a', 'b', 'c'], more: 2 });
    assert.deepEqual(handOf(waiting, true), { shown: waiting, more: 0 });
  });
});
