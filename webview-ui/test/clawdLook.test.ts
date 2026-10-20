import { describe, expect, it } from 'vitest';

import { effortLevel, effortMarks, modelScale } from '../src/views/clawdLook.js';

describe('clawdLook', () => {
  it('makes bigger models bigger Clawds', () => {
    const sizes = [
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
      'claude-fable-5-1',
    ].map(modelScale);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(modelScale(undefined)).toBe(1);
    expect(modelScale('opus')).toBe(modelScale('claude-opus-5-5[1m]'));
  });

  it('reads the effort and earns more marks the harder he works', () => {
    expect(effortLevel(' High ')).toBe('high');
    expect(effortLevel('turbo')).toBeUndefined();
    expect(
      ['low', 'medium', 'high', 'xhigh', 'max'].map((e) => effortMarks(effortLevel(e))),
    ).toEqual([0, 0, 1, 2, 3]);
  });
});
