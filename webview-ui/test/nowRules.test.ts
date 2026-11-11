/* eslint-disable pixel-agents/no-inline-colors -- «#348», «#2752» are PR numbers, not colours */
import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
  answerChoices,
  answerLine,
  asksAnswer,
  type NowAsk,
  nowQueue,
  rankAsk,
} from '../src/now/nowRules.ts';
import { timesOf } from '../src/now/nowTime.ts';
import { dayStrip } from '../src/now/stripRules.ts';

/** 6 Nov 2026 at that local time. */
const at = (h: number, m = 0, day = 6) => new Date(2026, 10, day, h, m).getTime();
const DEMO = { title: 'Demo agroactiva (reu interna de equipo)', start: at(15), end: at(16) };

describe('when an ask is for, from its words (real asks of 2026-11-05/06)', () => {
  it.each<[string, number, { due?: number; notBefore?: number }]>([
    [
      'mergear el PR 193 de la app a main y lanzar en Codemagic «iOS prod → TestFlight», antes de la una y veinte',
      at(10, 25),
      { due: at(13, 20) },
    ],
    [
      'elegir el diseño de la pantalla del plano para la demo antes de las diez y media',
      at(9, 48),
      { due: at(10, 30) },
    ],
    [
      'instalar el build nuevo desde TestFlight y probar el plano antes de las tres',
      at(14),
      { due: at(15) },
    ],
    ['mergear properties #348 a main a las 23, con su comando', at(14, 18), { notBefore: at(23) }],
    ['correr el pase a las 23:30', at(14), { notBefore: at(23, 30) }],
    ['Ensayo de la demo antes de las 22', at(17, 47, 5), { due: at(22, 0, 5) }],
    ['avisarme a las ocho de la noche', at(10), { notBefore: at(20) }],
    ['probarlo mañana a las 10', at(18), { notBefore: at(10, 0, 7) }],
    ['correr ese merge y avisarme', at(14), {}],
    ['la ronda de las 10 de la mañana ya pasó', at(14), {}],
  ])('«%s»', (text, ref, expected) => {
    assert.deepEqual(timesOf(text, ref, [DEMO]), expected);
  });

  it('«después de la demo» waits for the demo to end', () => {
    assert.deepEqual(timesOf('mergear webapp #2752 a main después de la demo', at(14), [DEMO]), {
      notBefore: at(16),
    });
    assert.deepEqual(timesOf('pasarlo después de la reunión', at(14), [DEMO]), {
      notBefore: at(16),
    });
    assert.deepEqual(timesOf('después de la demo', at(14), []), {});
  });

  it('«el pase de esta noche» is for tonight', () => {
    assert.deepEqual(timesOf('mergear #348 en el pase de esta noche', at(14), []), {
      notBefore: at(20),
    });
    assert.deepEqual(timesOf('mergear #348 en el pase de esta noche', at(21), []), {});
  });
});

const ask = (over: Partial<NowAsk> & { id: string; text: string }): NowAsk => ({
  from: 'Jarvis',
  at: at(14),
  ...over,
});

describe('«Ahora»: what goes first, and why', () => {
  const ctx = (now: number) => ({
    now,
    meetings: [DEMO],
    agents: [
      { name: 'penta', busy: false },
      { name: 'junta', busy: false },
      { name: 'taller', busy: true },
    ],
  });

  it('the 6/11 at 14:20: the browser holds two agents back; the 23:00 pase waits', () => {
    const q = nowQueue(
      [
        ask({
          id: 'p55',
          at: at(11, 23),
          text: 'Namecheap, wiselink.app, Advanced DNS: agregar dos registros A y avisarme',
        }),
        ask({
          id: 'p61',
          at: at(14, 16),
          question: true,
          text: '¿Ya puedo dejar que los agentes vuelvan a usar el navegador? Lo necesitan «penta» y «junta».',
        }),
        ask({ id: 'p62', text: 'mergear properties #348 a main a las 23' }),
        ask({ id: 'p58', at: at(11), text: 'mergear webapp #2752 a main después de la demo' }),
      ],
      ctx(at(14, 20)),
    );
    assert.equal(q.first?.ask.id, 'p61');
    assert.deepEqual(q.first?.blocks, ['penta', 'junta']);
    assert.equal(q.first?.reasons[0], 'Frena a «penta» y «junta»');
    assert.deepEqual(
      q.next.map((r) => r.ask.id),
      ['p55'],
    );
    assert.deepEqual(
      q.later.map((r) => r.ask.id),
      ['p58', 'p62'],
    );
  });

  it('a start comes forward half an hour before, and then goes first', () => {
    const pase = ask({ id: 'p62', text: 'mergear properties #348 a main a las 23' });
    const old = ask({ id: 'p1', at: at(9), text: 'cuestionario de cobro con Andy' });
    assert.equal(nowQueue([pase, old], ctx(at(22, 20))).first?.ask.id, 'p1');
    const q = nowQueue([pase, old], ctx(at(22, 35)));
    assert.equal(q.first?.ask.id, 'p62');
    assert.equal(q.first?.reasons[0], 'Es a las 23:00');
  });

  it('a deadline coming beats an old ask; one long past sinks again', () => {
    const due = ask({ id: 'd', at: at(13), text: 'probar el plano antes de las tres' });
    const old = ask({ id: 'o', at: at(8), text: 'revisar el informe' });
    const soon = nowQueue([old, due], ctx(at(14, 30)));
    assert.equal(soon.first?.ask.id, 'd');
    assert.equal(soon.first?.reasons[0], 'Vence a las 15:00, en 30 min');
    assert.equal(nowQueue([old, due], ctx(at(15, 10))).first?.reasons[0], 'Venció a las 15:00');
    assert.equal(nowQueue([old, due], ctx(at(19))).first?.ask.id, 'o');
  });

  it('a busy agent named is not held back', () => {
    const r = rankAsk(ask({ id: 'x', text: 'mirar lo de «taller»' }), ctx(at(14)));
    assert.deepEqual(r.blocks, []);
  });

  it('what Jarvis set by hand wins over the words', () => {
    const r = rankAsk(ask({ id: 'x', text: 'mergear a las 23', notBefore: at(21) }), ctx(at(14)));
    assert.equal(r.times.notBefore, at(21));
  });

  it('production and waiting long count, and say so', () => {
    const r = rankAsk(ask({ id: 'x', at: at(11), text: 'mergear #2752 a main' }), ctx(at(14)));
    assert.deepEqual(r.reasons, ['Va a producción', 'Espera hace 3 h']);
  });

  it('ties go to the oldest', () => {
    const a = ask({ id: 'a', at: at(14), text: 'uno' });
    const b = ask({ id: 'b', at: at(14), text: 'dos' });
    assert.equal(nowQueue([b, a], ctx(at(14))).first?.ask.id, 'b');
  });

  it('nothing waiting, nothing first', () => {
    assert.deepEqual(nowQueue([], ctx(at(14))), { first: undefined, next: [], later: [] });
  });
});

describe('what a tap answers', () => {
  it('a question of Jarvis, or «decirme si…»; not an errand, nor another agent', () => {
    assert.equal(asksAnswer(ask({ id: 'q', text: '¿Lo mergeo?', question: true })), true);
    assert.equal(asksAnswer(ask({ id: 'd', text: 'decirme si mergeo el PR treinta' })), true);
    assert.equal(asksAnswer(ask({ id: 'e', text: 'agregar el registro en Namecheap' })), false);
    assert.equal(asksAnswer(ask({ id: 'o', from: 'penta', text: 'decirme si sigo' })), false);
  });

  it('«¿quiere que…?» is a question too (it only had «Hecho», 2026-11-11)', () => {
    const q = ask({
      id: 'p202',
      text: '¿quiere que las páginas públicas vivan en eventos.wiselink.app?',
    });
    assert.deepEqual(answerChoices(q), ['Sí', 'No']);
  });

  it('the options Jarvis gave, one button each; an errand has none', () => {
    assert.deepEqual(
      answerChoices(ask({ id: 'a', text: 'elegir el diseño', options: ['La A', 'La B'] })),
      ['La A', 'La B'],
    );
    assert.deepEqual(answerChoices(ask({ id: 'e', text: 'agregar el registro en Namecheap' })), []);
  });

  it('a tap sends the id first, so the office marks it answered', () => {
    assert.equal(
      answerLine({ id: 'p202', text: '¿eventos o www?' }, 'Sí'),
      '[p202] Sí. (Sobre «¿eventos o www?»)',
    );
  });
});

describe('the strip of today', () => {
  const now = at(14, 20);
  const ranked = (asks: NowAsk[]) => {
    const q = nowQueue(asks, { now, agents: [], meetings: [DEMO] });
    return [...(q.first ? [q.first] : []), ...q.next, ...q.later];
  };

  it('meetings still ahead and asks with a time today, in order; hot within the hour', () => {
    const items = dayStrip(
      [
        { ...DEMO, id: 'demo', joinUrl: 'https://meet.google.com/x' },
        { id: 'daily', title: 'Daily', start: at(9), end: at(9, 30) },
        { id: 'quiet', title: 'Bloqueo', start: at(17), end: at(18), quiet: true },
        { id: 'lunes', title: 'Daily', start: at(9, 0, 9), end: at(9, 30, 9) },
      ],
      ranked([
        ask({ id: 'p62', text: 'mergear properties #348 a main a las 23' }),
        ask({ id: 'p56', text: 'probar el plano antes de las tres' }),
        ask({ id: 'p1', text: 'cuestionario de cobro' }),
      ]),
      now,
    );
    assert.deepEqual(
      items.map((i) => [i.when, i.kind, i.hot, i.soon]),
      [
        ['15:00', 'meeting', true, 'en 40 min'],
        ['antes de 15:00', 'due', true, 'en 40 min'],
        ['23:00', 'start', false, undefined],
      ],
    );
    assert.equal(items[0].joinUrl, 'https://meet.google.com/x');
  });

  it('a meeting under way is still there, «ahora»', () => {
    const items = dayStrip([DEMO], [], at(15, 10));
    assert.equal(items[0].soon, 'ahora');
  });
});
