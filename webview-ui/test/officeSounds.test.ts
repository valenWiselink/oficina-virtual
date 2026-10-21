import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHEER_NOTES, DONE_NOTES, DOOR_SOUND, TETOCA_SOUND } from '../src/constants.js';
import { setCalm } from '../src/effects/calmMode.js';
import { STARTUP_QUIET_MS } from '../src/effects/turnSounds.js';

/** Records what each sound asks the audio context for. */
class FakeParam {
  values: number[] = [];
  setValueAtTime(v: number) {
    this.values.push(v);
  }
  exponentialRampToValueAtTime(v: number) {
    this.values.push(v);
  }
}

const node = () => ({ connect() {}, start() {}, stop() {} });

class FakeAudioContext {
  static last: FakeAudioContext;
  state = 'running';
  currentTime = 0;
  sampleRate = 48_000;
  destination = {};
  oscillators: Array<{ type: string; frequency: FakeParam }> = [];
  clicks = 0;
  constructor() {
    FakeAudioContext.last = this;
  }
  createOscillator() {
    const osc = { ...node(), type: '', frequency: new FakeParam() };
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return { ...node(), gain: new FakeParam() };
  }
  createBiquadFilter() {
    this.clicks++;
    return { ...node(), type: '', frequency: new FakeParam(), Q: new FakeParam() };
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return { ...node(), buffer: null };
  }
  resume() {
    return Promise.resolve();
  }
}

vi.stubGlobal('AudioContext', FakeAudioContext);
const sound = await import('../src/notificationSound.js');
const { notifyWindows } = await import('../src/permissions/windowsNotify.js');

/** The pitch each oscillator settles on (after a knuckle's thud). */
function pitches(): number[] {
  const ctx = FakeAudioContext.last;
  if (!ctx) return [];
  return ctx.oscillators.map((o) => Math.round(o.frequency.values.at(-1)!));
}

function reset(): void {
  if (FakeAudioContext.last) {
    FakeAudioContext.last.oscillators = [];
    FakeAudioContext.last.clicks = 0;
  }
}

const round = (hz: number) => Math.round(hz);

describe('which sound plays', () => {
  beforeEach(() => {
    reset();
    sound.chooseSoundMode('all', () => {});
    setCalm(false);
  });

  it('a permission knocks on the door: two low wood hits with their click', async () => {
    await sound.playPermissionSound();
    const body = round(DOOR_SOUND.hits[0].hz);
    expect(pitches()).toEqual([
      body,
      round(body * DOOR_SOUND.overtone),
      body,
      round(body * DOOR_SOUND.overtone),
    ]);
    expect(FakeAudioContext.last.clicks).toBe(2);
    // The knuckle's thud: each body starts higher and falls to its pitch.
    expect(FakeAudioContext.last.oscillators[0].frequency.values[0]).toBeCloseTo(
      DOOR_SOUND.hits[0].hz * DOOR_SOUND.thud,
    );
  });

  it('the sparkle is an octave lower than it was (it peaks at G6, not G7)', async () => {
    await sound.playCheerSound();
    const fundamentals = pitches().filter((_, i) => i % 2 === 0);
    expect(fundamentals).toEqual(CHEER_NOTES.map((n) => round(n.hz)));
    expect(Math.max(...fundamentals)).toBe(1568);
  });

  it('calm mode silences the sparkle of "Hecho" and of a merge, not the door', async () => {
    setCalm(true);
    await sound.playCheerSound();
    expect(pitches()).toEqual([]);
    await sound.playPermissionSound();
    expect(pitches()).toContain(round(DOOR_SOUND.hits[0].hz));
  });

  it('"Sólo cuando te necesitan" keeps the door and drops the sparkle', async () => {
    sound.chooseSoundMode('needs', () => {});
    await sound.playCheerSound();
    expect(pitches()).toEqual([]);
    await sound.playPermissionSound();
    expect(pitches().length).toBeGreaterThan(0);
  });

  it('"Nada" is nothing at all', async () => {
    sound.chooseSoundMode('none', () => {});
    await sound.playPermissionSound();
    await sound.playCheerSound();
    expect(pitches()).toEqual([]);
  });
});

describe('the turn sounds, through the office', () => {
  beforeAll(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }));
  afterAll(() => vi.useRealTimers());
  beforeEach(() => {
    reset();
    sound.chooseSoundMode('all', () => {});
    vi.advanceTimersByTime(STARTUP_QUIET_MS + 60_000);
  });

  it('a "te toca" is two soft wood notes going up', async () => {
    sound.officeSounds.needsYou(1, false);
    await Promise.resolve();
    const [first, , second] = pitches();
    expect([first, second]).toEqual(TETOCA_SOUND.hits.map((h) => round(h.hz)));
    expect(second).toBeGreaterThan(first);
    expect(TETOCA_SOUND.volume).toBeLessThan(DOOR_SOUND.volume);
  });

  it('a question knocks on the door', async () => {
    sound.officeSounds.needsYou(2, true);
    await Promise.resolve();
    expect(pitches()[0]).toBe(round(DOOR_SOUND.hits[0].hz));
  });

  it('a turn with nothing for you gets the plin, as before', async () => {
    sound.officeSounds.turnEnded(3);
    vi.advanceTimersByTime(2_000);
    await Promise.resolve();
    const fundamentals = pitches().filter((_, i) => i % 2 === 0);
    expect(fundamentals).toEqual(DONE_NOTES.map((n) => round(n.hz)));
  });
});

describe('the Windows notice', () => {
  const shown: Array<{ title: string; silent?: boolean }> = [];
  class FakeNotification {
    static permission = 'granted';
    onclick: (() => void) | null = null;
    constructor(title: string, options: { silent?: boolean }) {
      shown.push({ title, silent: options.silent });
    }
    close() {}
  }

  beforeAll(() => {
    vi.stubGlobal('Notification', FakeNotification);
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false });
  });
  afterEach(() => {
    shown.length = 0;
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('goes out silent while the office makes its own sound', () => {
    sound.chooseSoundMode('all', () => {});
    notifyWindows('Langostino necesita permiso', 'Bash', 'req-1');
    sound.chooseSoundMode('needs', () => {});
    notifyWindows('Langostino necesita permiso', 'Bash', 'req-2');
    expect(shown.map((n) => n.silent)).toEqual([true, true]);
  });

  it('keeps Windows\' own sound when the office is set to "Nada"', () => {
    sound.chooseSoundMode('none', () => {});
    notifyWindows('Langostino necesita permiso', 'Bash', 'req-3');
    expect(shown).toEqual([{ title: 'Langostino necesita permiso', silent: false }]);
  });
});
