import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { AgentKind } from '../src/views/agentViews.ts';
import { callsForYou, controlOrder, stripTitle, toClose } from '../src/views/controlRules.ts';

const agent = (name: string, kind: AgentKind, permission?: object) => ({ name, kind, permission });

describe('the Control strip', () => {
  it('puts who needs you first, then who works, then who finished, then the idle', () => {
    const order = controlOrder([
      agent('quieto', 'idle'),
      agent('listo', 'done'),
      agent('pensando', 'think'),
      agent('pide', 'needs'),
      agent('junta', 'meet'),
    ]).map((a) => a.name);
    assert.deepEqual(order, ['pide', 'pensando', 'junta', 'listo', 'quieto']);
  });

  it('counts a held permission as needing you, whatever its kind', () => {
    const order = controlOrder([agent('trabaja', 'work'), agent('permiso', 'work', {})]);
    assert.equal(order[0].name, 'permiso');
    assert.equal(callsForYou(order[0]), true);
    assert.equal(callsForYou(order[1]), false);
  });

  it('keeps the office order inside each rank', () => {
    const order = controlOrder([agent('b', 'work'), agent('a', 'work'), agent('c', 'needs')]);
    assert.deepEqual(
      order.map((a) => a.name),
      ['c', 'b', 'a'],
    );
  });

  it('leaves the list it was given as it was', () => {
    const list = [agent('a', 'idle'), agent('b', 'needs')];
    controlOrder(list);
    assert.equal(list[0].name, 'a');
  });

  it('titles the strip with how many need you', () => {
    assert.equal(stripTitle([]), 'Agentes');
    assert.equal(stripTitle([agent('a', 'work')]), 'Agentes (1)');
    assert.equal(
      stripTitle([agent('a', 'needs'), agent('b', 'work')]),
      'Agentes (2) · 1 te necesita',
    );
    assert.equal(
      stripTitle([agent('a', 'needs'), agent('b', 'work', {})]),
      'Agentes (2) · 2 te necesitan',
    );
  });
});

describe('an agent the office finds no longer needed', () => {
  const spare = (name: string) => ({ name, kind: 'done' as AgentKind, closeSuggestedAt: 1 });

  it('goes last, after the idle, and says «para cerrar»', () => {
    const order = controlOrder([spare('demo'), agent('quieto', 'idle'), agent('listo', 'done')]);
    assert.deepEqual(
      order.map((a) => a.name),
      ['listo', 'quieto', 'demo'],
    );
    assert.equal(toClose(order[2]), true);
    assert.equal(toClose(order[0]), false);
  });

  it('a held permission still comes first', () => {
    const held = { ...spare('raro'), permission: {} };
    assert.equal(toClose(held), false);
    assert.equal(callsForYou(held), true);
  });

  it('is counted in the title', () => {
    assert.equal(
      stripTitle([agent('a', 'needs'), spare('b'), spare('c')]),
      'Agentes (3) · 1 te necesita · 2 para cerrar',
    );
    assert.equal(stripTitle([spare('b')]), 'Agentes (1) · 1 para cerrar');
  });
});
