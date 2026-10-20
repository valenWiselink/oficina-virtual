import { describe, expect, it } from 'vitest';

import { dayTintVar } from '../src/effects/dayPhase.js';

describe('dayTintVar', () => {
  it('goes morning, afternoon, dusk, night', () => {
    expect(dayTintVar(9)).toBe('--color-bg');
    expect(dayTintVar(15)).toBe('--color-bg-dark');
    expect(dayTintVar(19)).toBe('--color-sky-dusk');
    expect(dayTintVar(22)).toBe('--color-sky-night');
    expect(dayTintVar(3)).toBe('--color-sky-night');
  });
});
