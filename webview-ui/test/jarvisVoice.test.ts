import { describe, expect, it } from 'vitest';

import { heardText, SpeechGate } from '../src/jarvis/jarvisEars.js';
import { ANSWER_LAG_MS, speechStep, type SpeechWatch } from '../src/jarvis/jarvisRules.js';

describe('when Jarvis speaks', () => {
  type Now = {
    busy: boolean;
    head?: string;
    asksPermission?: boolean;
    aloud?: boolean;
    id?: number;
  };
  /** Feed renders in order; returns at which ones it spoke. */
  function run(steps: Array<[number, Now]>): number[] {
    let watch: SpeechWatch = { busy: false };
    const spoke: number[] = [];
    for (const [at, now] of steps) {
      const r = speechStep(watch, { id: 1, asksPermission: false, aloud: true, ...now }, at);
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

  it('not an answer with nothing to say aloud (a notice without «Te toca:»), nor later', () => {
    expect(
      run([
        [0, { busy: false, head: 'Antes.' }],
        [10, { busy: true, head: 'Antes.' }],
        [20, { busy: false, head: 'Anotado, señor.', aloud: false }],
        // The next render of the same answer does not say it either.
        [30, { busy: false, head: 'Anotado, señor.' }],
      ]),
    ).toEqual([]);
  });

  it('an answer to a notice with «Te toca:», and the next one to you', () => {
    expect(
      run([
        [0, { busy: false, head: 'Antes.' }],
        [10, { busy: true, head: 'Antes.', aloud: false }],
        [20, { busy: false, head: 'Coral abrió el PR. Te toca: mergearlo' }],
        [30, { busy: true, head: 'Coral abrió el PR. Te toca: mergearlo' }],
        [40, { busy: false, head: 'Anotado, señor.', aloud: false }],
        [50, { busy: true, head: 'Anotado, señor.' }],
        [60, { busy: false, head: 'Listo, señor.' }],
      ]),
    ).toEqual([20, 60]);
  });

  it('not when another Jarvis takes its place', () => {
    let watch: SpeechWatch = { id: 1, busy: true, headAtStart: 'A.' };
    const r = speechStep(
      watch,
      { id: 2, busy: false, head: 'B.', asksPermission: false, aloud: true },
      5,
    );
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

describe('what goes to the office', () => {
  it('is 16-bit little-endian PCM in base64, clipped', async () => {
    const { pcm16Base64 } = await import('../src/jarvis/jarvisEars.js');
    const bytes = Buffer.from(pcm16Base64(new Float32Array([0, 1, -1, 2, 0.5])), 'base64');
    expect(bytes.length).toBe(10);
    expect([0, 2, 4, 6, 8].map((i) => bytes.readInt16LE(i))).toEqual([
      0, 32767, -32768, 32767, 16383,
    ]);
  });
});

describe('Whisper stuck in a loop never reaches Jarvis', () => {
  it('says a repeated word or phrase once', async () => {
    const { heardText, withoutLoops } = await import('../src/jarvis/jarvisEars.js');
    const loop = `Listo, ya probé. ${'si, '.repeat(250)}si.`;
    expect(heardText(loop, 4)).toBe('Listo, ya probé. si.');
    expect(withoutLoops('dale dale dale dale dale, Coral')).toBe('dale, Coral');
    expect(withoutLoops('ya está ya está ya está ya está. Seguí')).toBe('ya está. Seguí');
    // Said three times is still how people talk.
    expect(withoutLoops('no, no, no, eso no')).toBe('no, no, no, eso no');
  });

  it('cuts what is longer than the time you talked could hold', async () => {
    const { heardText } = await import('../src/jarvis/jarvisEars.js');
    const long = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(' ');
    const text = heardText(long, 3) ?? '';
    expect(text.length).toBeLessThanOrEqual(81);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('the silence around your voice', () => {
  const frame = 1000 / 125;
  it('is measured over the first quarter second and cut before sending', async () => {
    const { SpeechGate, voiceOnly } = await import('../src/jarvis/jarvisEars.js');
    const gate = new SpeechGate(1200, 7000);
    const feed = (rms: number, ms: number) => {
      for (let t = 0; t < ms; t += frame) gate.feed(rms, frame);
    };
    feed(0.002, 1000); // the room
    feed(0.08, 2000); // you talk
    feed(0.002, 1200); // the quiet that stops it
    expect(gate.firstVoiceMs).toBeCloseTo(1000, -2);
    expect(gate.lastVoiceMs).toBeCloseTo(3000, -2);
    const audio = voiceOnly(new Float32Array(16_000 * 4.2), gate);
    expect(audio.length / 16_000).toBeCloseTo(2.6, 1); // 2 s + 0.3 s on each side
  });

  it('a voice from the very start does not raise the noise floor', async () => {
    const { SpeechGate } = await import('../src/jarvis/jarvisEars.js');
    const gate = new SpeechGate(1200, 7000);
    for (let t = 0; t < 250; t += frame) gate.feed(0.002, frame);
    for (let t = 0; t < 500; t += frame) gate.feed(0.05, frame);
    expect(gate.started).toBe(true);
  });
});
