import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { askWhen, readPendingAsksMessage, splitOpen } from '../src/pendingAsks/pendingAsksView.ts';

const NOW = new Date(2026, 10, 5, 14, 0).getTime();
const MIN = 60_000;

describe('since when', () => {
  it('near things by the clock', () => {
    assert.equal(askWhen(NOW - 10_000, NOW), 'recién');
    assert.equal(askWhen(NOW + 5_000, NOW), 'recién');
    assert.equal(askWhen(NOW - 12 * MIN, NOW), 'hace 12 min');
    assert.equal(askWhen(NOW - 180 * MIN, NOW), 'hace 3 h');
  });

  it('the rest by the calendar', () => {
    assert.equal(
      askWhen(new Date(2026, 10, 4, 23, 0).getTime(), new Date(2026, 10, 5, 2, 0).getTime()),
      'ayer',
    );
    assert.match(askWhen(new Date(2026, 9, 12, 10, 0).getTime(), NOW), /^12 oct$/);
  });
});

describe('message', () => {
  it('takes only its own', () => {
    assert.equal(readPendingAsksMessage({ type: 'artifactsList' }), null);
    assert.equal(readPendingAsksMessage({ type: 'pendingAsks', open: [] }), null);
    const msg = { type: 'pendingAsks', open: [], closed: [] };
    assert.deepEqual(readPendingAsksMessage(msg), msg);
  });
});

describe('what only looks done', () => {
  it('is kept apart, and out of the count', () => {
    const { waiting, seemsDone } = splitOpen([
      { id: 'p1', text: 'mergear #12', seemsDone: 'Se mergeó el PR #12' },
      { id: 'p2', text: 'agregar el registro en Namecheap' },
    ]);
    assert.deepEqual(
      waiting.map((a) => a.id),
      ['p2'],
    );
    assert.deepEqual(
      seemsDone.map((a) => a.id),
      ['p1'],
    );
  });
});

describe('what an agent is doing', () => {
  it('goes under «Lo hacen agentes», out of the count, even if it looks done', () => {
    const { waiting, seemsDone, delegated } = splitOpen([
      { id: 'p1', text: 'mergear #4', delegatedTo: { agent: 'pase3', at: 1 } },
      {
        id: 'p2',
        text: 'probar el panel',
        seemsDone: 'Se mergeó',
        delegatedTo: { agent: 'panel', at: 2 },
      },
      { id: 'p3', text: 'Chile y privacidad' },
    ]);
    assert.deepEqual(
      waiting.map((a) => a.id),
      ['p3'],
    );
    assert.deepEqual(seemsDone, []);
    assert.deepEqual(
      delegated.map((a) => a.id),
      ['p1', 'p2'],
    );
  });
});
