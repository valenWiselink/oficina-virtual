import { describe, expect, it } from 'vitest';

import { heardText, SpeechGate } from '../src/jarvis/jarvisEars.js';
import { ANSWER_LAG_MS, speechStep, type SpeechWatch } from '../src/jarvis/jarvisRules.js';

describe('when Jarvis speaks', () => {
  type Now = { busy: boolean; head?: string; asksPermission?: boolean; id?: number };
  /** Feed renders in order; returns at which ones it spoke. */
  function run(steps: Array<[number, Now]>): number[] {
    let watch: SpeechWatch = { busy: false };
    const spoke: number[] = [];
    for (const [at, now] of steps) {
      const r = speechStep(watch, { id: 1, asksPermission: false, ...now }, at);
      watch = r.next;
      if (r.speak) spoke.push(at);
    }
    return spoke;
  }

  it('at the end of a turn with a new answer', () => {
    expect(
      run([
        [0, { busy: false, head: 'Antes.' }],
        [10, { busy: true, head: 'Antes.' }],
        [20, { busy: false, head: 'Hecho, señor.' }],
      ]),
    ).toEqual([20]);
  });

  it('when the answer arrives after the end of the turn (the hook is faster)', () => {
    expect(
      run([
        [0, { busy: false, head: 'Antes.' }],
        [10, { busy: true, head: 'Antes.' }],
        [20, { busy: false, head: 'Antes.' }], // Stop: the transcript is not read yet
        [1500, { busy: false, head: 'Hecho, señor.' }], // now it is
        [1600, { busy: false, head: 'Hecho, señor.' }],
      ]),
    ).toEqual([1500]);
  });

  it('a text written mid-turn counts only when the turn ends', () => {
    expect(
      run([
        [0, { busy: false, head: 'Antes.' }],
        [10, { busy: true, head: 'Antes.' }],
        [20, { busy: true, head: 'Reviso, señor.' }],
        [30, { busy: false, head: 'Reviso, señor.' }],
      ]),
    ).toEqual([30]);
  });

  it('not on page load, an old answer, mid-turn, a permission or a late stray text', () => {
    expect(run([[0, { busy: false, head: 'Hecho.' }]])).toEqual([]);
    expect(
      run([
        [0, { busy: false, head: 'Hecho.' }],
        [10, { busy: true, head: 'Hecho.' }],
        [20, { busy: false, head: 'Hecho.' }],
      ]),
    ).toEqual([]);
    expect(
      run([
        [0, { busy: false, head: 'A.' }],
        [10, { busy: true, head: 'A.' }],
        [20, { busy: false, head: 'B.', asksPermission: true }],
      ]),
    ).toEqual([]);
    expect(
      run([
        [0, { busy: false, head: 'A.' }],
        [10, { busy: true, head: 'A.' }],
        [20, { busy: false, head: 'A.' }],
        [20 + ANSWER_LAG_MS + 1, { busy: false, head: 'B.' }],
      ]),
    ).toEqual([]);
  });

  it('not when another Jarvis takes its place', () => {
    let watch: SpeechWatch = { id: 1, busy: true, headAtStart: 'A.' };
    const r = speechStep(watch, { id: 2, busy: false, head: 'B.', asksPermission: false }, 5);
    watch = r.next;
    expect(r.speak).toBe(false);
    expect(watch).toEqual({ id: 2, busy: false, headAtStart: 'B.' });
  });
});

describe('when Jarvis stops listening', () => {
  const frame = 1000 / 125; // 8 ms frames of 128 samples at 16 kHz
  const feed = (gate: SpeechGate, rms: number, ms: number) => {
    let verdict: ReturnType<SpeechGate['feed']> = 'more';
    for (let t = 0; t < ms && verdict === 'more'; t += frame) verdict = gate.feed(rms, frame);
    return verdict;
  };

  it('after you talk and then stay quiet a moment', () => {
    const gate = new SpeechGate(1200, 7000);
    expect(feed(gate, 0.002, 300)).toBe('more'); // the room
    expect(feed(gate, 0.08, 1500)).toBe('more'); // you talk
    expect(gate.started).toBe(true);
    expect(feed(gate, 0.003, 600)).toBe('more'); // a pause mid-sentence
    expect(feed(gate, 0.06, 400)).toBe('more');
    expect(feed(gate, 0.003, 1300)).toBe('done');
  });

  it('with nothing, if you never talk', () => {
    const gate = new SpeechGate(1200, 2000);
    expect(feed(gate, 0.003, 2100)).toBe('nothing');
  });

  it('a noisy room does not count as talking', () => {
    const gate = new SpeechGate(1200, 2000);
    expect(feed(gate, 0.02, 2100)).toBe('nothing');
  });
});

describe('what it heard', () => {
  it('drops what Whisper writes for silence', () => {
    expect(heardText(' Gracias por ver el video. ')).toBeUndefined();
    expect(heardText('Subtítulos realizados por la comunidad de Amara.org')).toBeUndefined();
    expect(heardText('[Música]')).toBeUndefined();
    expect(heardText('...')).toBeUndefined();
    expect(heardText('Jarvis,  ¿cómo viene Coral?')).toBe('Jarvis, ¿cómo viene Coral?');
  });
});
