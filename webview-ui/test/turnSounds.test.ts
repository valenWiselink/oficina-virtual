import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTurnSounds,
  DECIDE_AFTER_MS,
  PLIN_GAP_MS,
  STARTUP_QUIET_MS,
} from '../src/effects/turnSounds.js';

function setup() {
  const played: string[] = [];
  const sounds = createTurnSounds({
    knock: (urgent) => played.push(urgent ? 'knock!' : 'knock'),
    finished: () => played.push('finished'),
    plin: () => played.push('plin'),
  });
  // Past the first moments after the page opened.
  vi.advanceTimersByTime(STARTUP_QUIET_MS);
  return { played, sounds };
}

describe('the sound a turn earns', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('knocks for a "te toca" that lands just after the end, and no plin', () => {
    const { played, sounds } = setup();
    sounds.turnEnded(1);
    vi.advanceTimersByTime(100);
    sounds.needsYou(1, false);
    vi.advanceTimersByTime(DECIDE_AFTER_MS * 2);
    expect(played).toEqual(['knock']);
  });

  it('knocks for a "te toca" that lands just before the end, and no plin', () => {
    const { played, sounds } = setup();
    sounds.needsYou(1, false);
    vi.advanceTimersByTime(100);
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS * 2);
    expect(played).toEqual(['knock']);
  });

  it('a turn with nothing for you gets one soft plin, after a moment', () => {
    const { played, sounds } = setup();
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS - 1);
    expect(played).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(played).toEqual(['finished', 'plin']);
  });

  it('many ends close together make one plin, but every one counts', () => {
    const { played, sounds } = setup();
    sounds.turnEnded(1);
    sounds.turnEnded(2);
    sounds.turnEnded(3);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    vi.advanceTimersByTime(PLIN_GAP_MS - DECIDE_AFTER_MS - 1);
    sounds.turnEnded(4);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    expect(played.filter((p) => p === 'plin')).toHaveLength(1);
    expect(played.filter((p) => p === 'finished')).toHaveLength(4);
    sounds.turnEnded(5);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    expect(played.filter((p) => p === 'plin')).toHaveLength(2);
  });

  it('says a question is urgent, and several needs at once knock once', () => {
    const { played, sounds } = setup();
    sounds.needsYou(1, true);
    sounds.needsYou(2, false);
    expect(played).toEqual(['knock!']);
  });

  it('stays quiet about what was already there when the page opened', () => {
    const played: string[] = [];
    const sounds = createTurnSounds({
      knock: () => played.push('knock'),
      finished: () => played.push('finished'),
      plin: () => played.push('plin'),
    });
    sounds.needsYou(1, false);
    sounds.turnEnded(2);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    expect(played).toEqual([]);
    expect(sounds.starting()).toBe(true);
  });
});
