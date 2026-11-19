import { describe, expect, it } from 'vitest';

import { reuseUnchanged, sameValue } from '../src/views/viewsReuse.js';

describe('sameValue', () => {
  it('compares plain data by value', () => {
    expect(sameValue({ a: 1, b: [1, { c: 'x' }] }, { a: 1, b: [1, { c: 'x' }] })).toBe(true);
    expect(sameValue({ a: 1, b: [1, { c: 'x' }] }, { a: 1, b: [1, { c: 'y' }] })).toBe(false);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
    expect(sameValue([], {})).toBe(false);
  });

  it('treats an undefined field like a missing one (views spread optional fields)', () => {
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: 1, b: undefined }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('reuseUnchanged', () => {
  const a = { id: 1, kind: 'work', text: 'Leyendo ULTIMO.md' };
  const b = { id: 2, kind: 'idle', text: 'Sin tarea' };

  it('returns the previous list itself when nothing changed', () => {
    const previous = [a, b];
    const next = [{ ...a }, { ...b }];
    expect(reuseUnchanged(previous, next)).toBe(previous);
  });

  it('keeps the unchanged items and takes only the one that moved', () => {
    const previous = [a, b];
    const moved = { ...a, text: 'Corriendo flutter analyze' };
    const result = reuseUnchanged(previous, [moved, { ...b }]);
    expect(result).not.toBe(previous);
    expect(result[0]).toBe(moved);
    expect(result[1]).toBe(b);
  });

  it('notices a reorder, an addition and a removal', () => {
    const previous = [a, b];
    const reordered = reuseUnchanged(previous, [{ ...b }, { ...a }]);
    expect(reordered).not.toBe(previous);
    expect(reordered[0]).toBe(b);
    expect(reuseUnchanged(previous, [{ ...a }])).toEqual([a]);
    expect(
      reuseUnchanged(previous, [{ ...a }, { ...b }, { id: 3, kind: 'done', text: 'Terminó' }]),
    ).toHaveLength(3);
  });
});
