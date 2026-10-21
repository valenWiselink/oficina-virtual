import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTurnSounds,
  DECIDE_AFTER_MS,
  PLIN_GAP_MS,
  STARTUP_QUIET_MS,
  TYPING_QUIET_MS,
} from '../src/effects/turnSounds.js';

function setup(watching: { inView?: Set<number>; lastKeyAt?: () => number } = {}) {
  const played: string[] = [];
  const sounds = createTurnSounds(
    {
      door: () => played.push('door'),
      teToca: () => played.push('teToca'),
      finished: () => played.push('finished'),
      plin: () => played.push('plin'),
    },
    () => Date.now(),
    {
      inView: (id) => watching.inView?.has(id) ?? false,
      lastKeyAt: watching.lastKeyAt ?? (() => -Infinity),
    },
  );
  // Past the first moments after the page opened.
  vi.advanceTimersByTime(STARTUP_QUIET_MS);
  return { played, sounds };
}

describe('the sound a turn earns', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays the "te toca" for one that lands just after the end, and no plin', () => {
    const { played, sounds } = setup();
    sounds.turnEnded(1);
    vi.advanceTimersByTime(100);
    sounds.needsYou(1, false);
    vi.advanceTimersByTime(DECIDE_AFTER_MS * 2);
    expect(played).toEqual(['teToca']);
  });

  it('plays the "te toca" for one that lands just before the end, and no plin', () => {
    const { played, sounds } = setup();
    sounds.needsYou(1, false);
    vi.advanceTimersByTime(100);
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS * 2);
    expect(played).toEqual(['teToca']);
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

  it('a question knocks on the door; a "te toca" right after it stays quiet', () => {
    const { played, sounds } = setup();
    sounds.needsYou(1, true);
    sounds.needsYou(2, false);
    sounds.needsYou(3, true);
    expect(played).toEqual(['door']);
  });

  it('a question right after a "te toca" still knocks', () => {
    const { played, sounds } = setup();
    sounds.needsYou(1, false);
    vi.advanceTimersByTime(500);
    sounds.needsYou(2, true);
    expect(played).toEqual(['teToca', 'door']);
  });

  it('stays quiet about what was already there when the page opened', () => {
    const played: string[] = [];
    const sounds = createTurnSounds({
      door: () => played.push('door'),
      teToca: () => played.push('teToca'),
      finished: () => played.push('finished'),
      plin: () => played.push('plin'),
    });
    sounds.needsYou(1, true);
    sounds.needsYou(2, false);
    sounds.turnEnded(3);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    expect(played).toEqual([]);
    expect(sounds.starting()).toBe(true);
  });
});

describe('the office keeps quiet about what you already see', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no plin for the agent whose terminal or chat is in front of you', () => {
    const { played, sounds } = setup({ inView: new Set([1]) });
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    // Still counted (focus mode's summary), just not rung.
    expect(played).toEqual(['finished']);
  });

  it('that silence does not use up the plin of another agent', () => {
    const { played, sounds } = setup({ inView: new Set([1]) });
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    sounds.turnEnded(2);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    expect(played).toEqual(['finished', 'finished', 'plin']);
  });

  it('its "te toca" and its question still sound', () => {
    const { played, sounds } = setup({ inView: new Set([1]) });
    sounds.needsYou(1, false);
    vi.advanceTimersByTime(5_000);
    sounds.needsYou(1, true);
    expect(played).toEqual(['teToca', 'door']);
  });
});

describe('while you type', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A key pressed every second for `seconds`, the last one now. */
  function typeFor(keys: { at: number }, seconds: number) {
    for (let s = 0; s < seconds; s++) {
      keys.at = Date.now();
      vi.advanceTimersByTime(1_000);
    }
    keys.at = Date.now();
  }

  it('the plin waits until you stop, then sounds once', () => {
    const keys = { at: -Infinity };
    const { played, sounds } = setup({ lastKeyAt: () => keys.at });
    keys.at = Date.now();
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    expect(played).toEqual(['finished']);
    typeFor(keys, 6);
    expect(played).toEqual(['finished']);
    vi.advanceTimersByTime(TYPING_QUIET_MS - 1);
    expect(played).toEqual(['finished']);
    vi.advanceTimersByTime(1);
    expect(played).toEqual(['finished', 'plin']);
  });

  it('a plin and a "te toca" held together sound as one "te toca"', () => {
    const keys = { at: -Infinity };
    const { played, sounds } = setup({ lastKeyAt: () => keys.at });
    keys.at = Date.now();
    sounds.turnEnded(1);
    vi.advanceTimersByTime(DECIDE_AFTER_MS);
    sounds.needsYou(2, false);
    typeFor(keys, 3);
    vi.advanceTimersByTime(TYPING_QUIET_MS);
    expect(played).toEqual(['finished', 'teToca']);
    vi.advanceTimersByTime(60_000);
    expect(played).toEqual(['finished', 'teToca']);
  });

  it('the door never waits', () => {
    const keys = { at: -Infinity };
    const { played, sounds } = setup({ lastKeyAt: () => keys.at });
    keys.at = Date.now();
    sounds.needsYou(1, true);
    expect(played).toEqual(['door']);
  });

  it('the "te toca" sounds right away when you are not typing', () => {
    const keys = { at: -Infinity };
    const { played, sounds } = setup({ lastKeyAt: () => keys.at });
    keys.at = Date.now();
    vi.advanceTimersByTime(TYPING_QUIET_MS);
    sounds.needsYou(1, false);
    expect(played).toEqual(['teToca']);
  });
});
