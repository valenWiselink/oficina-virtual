import { describe, expect, it } from 'vitest';

import { freshLaunchChoice } from '../src/launch/launchMemory.js';

const COLORS = 6;

describe('freshLaunchChoice', () => {
  it('keeps the last choice when nobody in the office has it', () => {
    expect(
      freshLaunchChoice(
        { nickname: 'Pagos', palette: 3, model: 'opus', effort: 'high' },
        [{ name: 'Web', palette: 1 }],
        COLORS,
      ),
    ).toEqual({ nickname: 'Pagos', palette: 3, model: 'opus', effort: 'high' });
  });

  it('numbers the name when an agent already uses it', () => {
    const taken = [
      { name: 'pagos', palette: 0 },
      { name: 'Pagos 2', palette: 1 },
    ];
    expect(freshLaunchChoice({ nickname: 'Pagos', palette: 4 }, taken, COLORS).nickname).toBe(
      'Pagos 3',
    );
    expect(freshLaunchChoice({ nickname: 'Pagos 2', palette: 4 }, taken, COLORS).nickname).toBe(
      'Pagos 3',
    );
  });

  it('moves to the least used colour when the remembered one is taken', () => {
    const taken = [
      { name: 'A', palette: 0 },
      { name: 'B', palette: 1 },
      { name: 'C', palette: 2 },
    ];
    expect(freshLaunchChoice({ nickname: '', palette: 0 }, taken, COLORS).palette).toBe(3);
    const crowded = Array.from({ length: COLORS }, (_, p) => ({ name: `x${p}`, palette: p }));
    crowded.push({ name: 'y', palette: 2 });
    expect(freshLaunchChoice({ nickname: '', palette: 2 }, crowded, COLORS).palette).toBe(3);
  });

  it('starts blank and orange with nothing remembered', () => {
    expect(freshLaunchChoice(null, [], COLORS)).toEqual({
      nickname: '',
      palette: 0,
      model: null,
      effort: null,
    });
  });
});
