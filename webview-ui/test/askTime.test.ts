import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { readWhen, timesOf, whenText } from '../../core/src/askTime.ts';
import { nowQueue } from '../src/now/nowRules.ts';
import { pickedTime, snoozeChoices } from '../src/now/snoozeRules.ts';

/** November 2026 at that local time: Wednesday 11, Thursday 12, Friday 13. */
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
const DEMO = { title: 'Demo AgroActiva', start: at(12, 10), end: at(12, 11) };
const PASE = { title: 'Pase de seguridad con Gian', start: at(11, 16, 36), end: at(11, 17, 6) };

describe('another day, read from the words (D12, 2026-11-11)', () => {
  const asked = at(11, 14, 30);

  it('«mañana…, apenas termine la demo» is after tomorrow’s demo', () => {
    const text = 'Mañana jueves 12, apenas termine la demo: volver a marcar AgroActiva como demo';
    assert.equal(timesOf(text, asked, [DEMO]).notBefore, at(12, 11));
    // Without the calendar: tomorrow morning, never today.
    assert.equal(timesOf(text, asked).notBefore, at(12, 9));
  });

  it('it is for later today, not first', () => {
    const ask = {
      id: 'p179',
      from: 'Jarvis',
      at: asked,
      text: 'Mañana jueves 12, apenas termine la demo: volver a marcar AgroActiva como demo',
    };
    const queue = nowQueue([ask], { now: at(11, 18, 45), agents: [], meetings: [DEMO] });
    assert.equal(queue.first, undefined);
    assert.equal(queue.later[0]?.ask.id, 'p179');
  });

  it.each<[string, number]>([
    ['que Valentín confirme el viernes 13/11 si se pueden borrar las copias', at(13, 9)],
    ['revisarlo el lunes', at(16, 9)],
    ['mañana a la tarde, probar el pago', at(12, 15)],
    ['el jueves a las 11 mirar el plano', at(12, 11)],
    ['el 13 de noviembre a las 10 llamar a la organización', at(13, 10)],
  ])('«%s»', (text, expected) => {
    assert.equal(timesOf(text, asked).notBefore, expected);
  });

  it('«antes del viernes» is due by the end of Friday', () => {
    assert.equal(timesOf('mandar el informe antes del viernes', asked).due, at(13, 18));
  });

  it('a plain hour still reads as today', () => {
    assert.equal(timesOf('a las 23 el pase', asked).notBefore, at(11, 23));
  });
});

describe('Jarvis’s «cuando»', () => {
  const now = at(11, 15, 45);
  it.each<[string, number]>([
    ['23:00', at(11, 23)],
    ['mañana', at(12, 9)],
    ['mañana 11:00', at(12, 11)],
    ['jueves 12 a las 11', at(12, 11)],
    ['13/11 9:00', at(13, 9)],
    ['el lunes', at(16, 9)],
    ['esta noche', at(11, 20)],
  ])('«%s»', (said, expected) => {
    assert.equal(readWhen(said, now)?.at, expected);
  });

  it('after a meeting of the calendar, tied to it', () => {
    assert.deepEqual(readWhen('después de: Demo AgroActiva', now, [DEMO]), {
      at: at(12, 11),
      after: 'Demo AgroActiva',
    });
    assert.equal(readWhen('después de: la reunión con Andy', now, [DEMO]), undefined);
  });

  it('nonsense is not a time', () => {
    assert.equal(readWhen('cuando pueda', now), undefined);
    assert.equal(readWhen('25:00', now), undefined);
  });
});

describe('when, in words', () => {
  const now = at(11, 15, 45);
  it('today the hour, tomorrow «mañana», further the day', () => {
    assert.equal(whenText(at(11, 17, 6), now), '17:06');
    assert.equal(whenText(at(12, 9), now), 'mañana 9:00');
    assert.equal(whenText(at(16, 9), now), 'lun 16, 9:00');
  });
});

describe('«Posponer»', () => {
  it('after the meeting it names, after today’s next one, tomorrow, Monday, an hour', () => {
    const choices = snoozeChoices(
      { text: 'apenas termine la demo: volver a marcar AgroActiva' },
      at(11, 15, 45),
      [PASE, DEMO],
    );
    assert.deepEqual(
      choices.map((c) => [c.label, c.when]),
      [
        ['Después de Demo AgroActiva', 'mañana 11:00'],
        ['Al terminar Pase de seguridad con Gian', '17:06'],
        ['Mañana a la mañana', 'mañana 9:00'],
        ['El lunes', 'lun 16, 9:00'],
        ['En una hora', '16:45'],
      ],
    );
  });

  it('on a Friday the next working morning is Monday, said once', () => {
    const choices = snoozeChoices({ text: 'mirar el informe' }, at(13, 17), []);
    assert.deepEqual(
      choices.map((c) => c.label),
      ['El lunes a la mañana', 'En una hora'],
    );
  });

  it('a day and time picked by hand, only ahead', () => {
    assert.equal(pickedTime('2026-11-12T11:00', at(11, 15)), at(12, 11));
    assert.equal(pickedTime('2026-11-10T11:00', at(11, 15)), undefined);
    assert.equal(pickedTime('', at(11, 15)), undefined);
  });
});
