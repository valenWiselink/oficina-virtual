import { describe, expect, it } from 'vitest';

import { heardText, SpeechGate } from '../src/jarvis/jarvisEars.js';
import { shouldSpeak } from '../src/jarvis/jarvisRules.js';

describe('when Jarvis speaks', () => {
  const now = { id: 1, busy: false, head: 'Hecho, señor.', asksPermission: false };

  it('at the end of a turn with a new answer', () => {
    expect(shouldSpeak({ id: 1, busy: true, headAtStart: 'Antes.' }, now)).toBe(true);
  });

  it('not on page load, nor for the answer it already had, nor mid-turn', () => {
    expect(shouldSpeak({ busy: false }, now)).toBe(false);
    expect(shouldSpeak({ id: 1, busy: true, headAtStart: 'Hecho, señor.' }, now)).toBe(false);
    expect(shouldSpeak({ id: 1, busy: true }, { ...now, busy: true })).toBe(false);
    expect(shouldSpeak({ id: 1, busy: true }, { ...now, asksPermission: true })).toBe(false);
    expect(shouldSpeak({ id: 2, busy: true }, now)).toBe(false);
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
