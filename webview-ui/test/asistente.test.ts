import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { DayLogEntry } from '../../core/src/messages.ts';
import { activityOf, handOf, momentLabel, readMoment } from '../src/asistente/asistenteRules.ts';

const MIN = 60_000;
const NOW = new Date(2026, 10, 11, 16, 0).getTime();
const entry = (agent: string, minutesAgo: number): DayLogEntry => ({
  at: NOW - minutesAgo * MIN,
  agent,
  kind: 'respuesta',
  text: '…',
});

describe('the moment', () => {
  it('remembered «Escribir» stays; anything else is «Decidir»', () => {
    assert.equal(readMoment('escribir'), 'escribir');
    assert.equal(readMoment('decidir'), 'decidir');
    assert.equal(readMoment(null), 'decidir');
    assert.equal(readMoment('reunion'), 'decidir');
  });

  it('«Decidir» says how many wait', () => {
    assert.equal(momentLabel('decidir', 3), 'Decidir · 3');
    assert.equal(momentLabel('decidir', 0), 'Decidir');
    assert.equal(momentLabel('escribir', 3), 'Escribir');
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
    assert.deepEqual(handOf(['a'], false), { shown: ['a'], more: 0 });
  });
});
