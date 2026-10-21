import { describe, expect, it } from 'vitest';

import { joinWithY, missedSummary } from '../src/focus/focusMode.js';
import {
  allDoneText,
  fresh,
  mergeMoment,
  mergeTitle,
  moreThanBefore,
} from '../src/views/cheerText.js';
import { allDoneBetween, noteAllDone } from '../src/views/officeMoments.js';

const merged = (prUrl: string, agent: string) => ({ kind: 'mergeado', prUrl, agent });

describe('mergeTitle', () => {
  it('keeps the day’s count', () => {
    expect(mergeTitle({ count: 1, agent: 'Langostino' })).toBe('¡Primer merge del día!');
    expect(mergeTitle({ count: 3, agent: 'Pagos', previousAgent: 'Langostino' })).toBe(
      '¡Otro adentro! · van 3 hoy',
    );
    expect(mergeTitle({ count: 5, agent: 'Pagos', previousAgent: 'Langostino' })).toBe(
      'Van 5. Día redondo',
    );
    expect(mergeTitle({ count: 7 })).toBe('¡Otro más! · van 7 hoy');
  });

  it('notices the same agent merging twice in a row (not on the first)', () => {
    expect(mergeTitle({ count: 2, agent: 'Langostino', previousAgent: 'Langostino' })).toBe(
      'Langostino no para',
    );
    expect(mergeTitle({ count: 1, agent: 'Langostino', previousAgent: 'Langostino' })).toBe(
      '¡Primer merge del día!',
    );
  });

  it('never says the same line twice in a row', () => {
    const first = mergeTitle({ count: 3, agent: 'A', previousAgent: 'A' });
    const second = mergeTitle({ count: 4, agent: 'A', previousAgent: 'A' }, first);
    expect(second).not.toBe(first);
    expect(second).toBe('A sigue de racha');
    expect(mergeTitle({ count: 5 }, 'Van 5. Día redondo')).toBe('¡Cinco! Día redondo');
  });
});

describe('mergeMoment', () => {
  it('counts distinct merged PRs today, this one included before its line arrives', () => {
    const entries = [
      merged('u1', 'Langostino'),
      merged('u1', 'Langostino'),
      { kind: 'tetoca', prUrl: 'u9', agent: 'Pagos' },
      merged('u2', 'Pagos'),
    ];
    expect(mergeMoment(entries, 'u3', 'Pagos')).toEqual({
      count: 3,
      agent: 'Pagos',
      previousAgent: 'Pagos',
    });
    // Its own line already arrived: still 2, and the one before is u1's.
    expect(mergeMoment(entries.slice(0, 4), 'u2', 'Otro nombre')).toEqual({
      count: 2,
      agent: 'Pagos',
      previousAgent: 'Langostino',
    });
  });

  it('takes nobody’s line as no name', () => {
    expect(mergeMoment([merged('u1', 'Un agente')], 'u2').previousAgent).toBeUndefined();
  });
});

describe('allDoneText', () => {
  it('knows the hour', () => {
    expect(allDoneText(10)).toMatch(/estirar las piernas/);
    expect(allDoneText(13)).toBe('Todos quietos. ¿Almorzaste?');
    expect(allDoneText(15)).toMatch(/estirar las piernas/);
    expect(allDoneText(17)).toBe('Buen momento para cerrar el día.');
    expect(allDoneText(22)).toMatch(/cerrar el día/);
  });

  it('never repeats the last one', () => {
    const a = allDoneText(13);
    expect(allDoneText(13, a)).not.toBe(a);
    expect(fresh(['x'], 'x')).toBe('x');
  });
});

describe('moreThanBefore', () => {
  it('only says it when it is true, never "menos"', () => {
    expect(moreThanBefore(30, { count: 20, label: 'ayer' })).toBe('Más que ayer.');
    expect(moreThanBefore(30, { count: 20, label: 'el viernes' })).toBe('Más que el viernes.');
    expect(moreThanBefore(20, { count: 20, label: 'ayer' })).toBeUndefined();
    expect(moreThanBefore(10, { count: 20, label: 'ayer' })).toBeUndefined();
    expect(moreThanBefore(10, { count: 0, label: 'ayer' })).toBeUndefined();
    expect(moreThanBefore(10, undefined)).toBeUndefined();
  });
});

describe('the focus summary with merges', () => {
  it('adds what the focus kept quiet', () => {
    expect(missedSummary({ termino: 2, mergeado: 1 })).toBe(
      '2 agentes terminaron y se mergeó 1 PR mientras tanto.',
    );
    expect(missedSummary({ termino: 4, todos: 1, tetoca: 1, mergeado: 2 })).toBe(
      'terminaron todos, 1 te dejó algo y se mergearon 2 PRs mientras tanto.',
    );
    expect(joinWithY(['a'])).toBe('a');
  });
});

describe('"Terminaron todos" moments', () => {
  it('are remembered for «Volviste», shown or not', () => {
    noteAllDone(1_000_000);
    expect(allDoneBetween(900_000, 1_100_000)).toBe(true);
    expect(allDoneBetween(1_100_001, 2_000_000)).toBe(false);
  });
});
