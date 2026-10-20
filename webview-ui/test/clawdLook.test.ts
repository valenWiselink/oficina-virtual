import { describe, expect, it } from 'vitest';

import {
  effortLevel,
  effortMarks,
  headDrop,
  modelFamily,
  modelLook,
  modelScale,
} from '../src/views/clawdLook.js';

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

  it('knows the family from an id or an alias', () => {
    expect(modelFamily('claude-fable-5-1')).toBe('fable');
    expect(modelFamily('Sonnet[1m]')).toBe('sonnet');
    expect(modelFamily('haiku')).toBe('haiku');
    expect(modelFamily('gpt-4')).toBeUndefined();
    expect(modelFamily(undefined)).toBeUndefined();
  });

  it('gives each model its own body, material and bubble outline', () => {
    const looks = ['haiku', 'sonnet', 'opus', 'fable'].map(modelLook);
    expect(looks.map((l) => l.form)).toEqual(['hatchling', 'classic', 'claws', 'legend']);
    expect(looks.map((l) => l.material)).toEqual(['paper', 'plush', 'metal', 'holo']);
    expect(looks.map((l) => l.rim)).toEqual(['segments', 'single', 'double', 'medal']);
  });

  it('leaves an unknown model as the Clawd he always was', () => {
    expect(modelLook(undefined)).toEqual({ scale: 1, form: 'classic', rim: 'single' });
  });

  it('drops only a hatchling head', () => {
    expect(headDrop('hatchling')).toBe(3);
    expect(headDrop('legend')).toBe(0);
    expect(headDrop(undefined)).toBe(0);
  });
});
