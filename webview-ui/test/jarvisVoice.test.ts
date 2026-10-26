import { describe, expect, it } from 'vitest';

import { clock, Dictation, type Part, partAudio } from '../src/jarvis/dictation.js';
import { heardText, PartWriter } from '../src/jarvis/jarvisEars.js';
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

/** 8 ms frames of 128 samples at 16 kHz, `ms` of them at loudness `rms`;
 *  the parts it cut, and whether the safety net stopped it. */
function feed(d: Dictation, rms: number, ms: number): { parts: Part[]; full: boolean } {
  const parts: Part[] = [];
  for (let t = 0; t < ms; t += 8) {
    const step = d.feed(rms, 128);
    if (step.part) parts.push(step.part);
    if (step.full) return { parts, full: true };
  }
  return { parts, full: false };
}
const seconds = (samples: number) => samples / 16_000;

describe('dictating to Jarvis', () => {
  it('never stops by itself when you go quiet to think', () => {
    const d = new Dictation();
    feed(d, 0.002, 300); // the room
    feed(d, 0.08, 1500); // you talk
    const thinking = feed(d, 0.003, 20_000); // 20 s thinking
    expect(thinking.full).toBe(false);
    // What you said before is written meanwhile; the silence is never sent.
    expect(thinking.parts).toHaveLength(1);
    expect(seconds(thinking.parts[0].voiceTo)).toBeCloseTo(1.8, 1);
    feed(d, 0.08, 2000); // and go on
    const last = d.finish();
    expect(d.heard).toBe(true);
    expect(last && seconds(last.voiceFrom)).toBeCloseTo(21.8, 1);
  });

  it('stops by itself only at the safety net, with the rest in the last part', () => {
    const d = new Dictation(30_000);
    feed(d, 0.002, 300);
    let full = false;
    const parts: Part[] = [];
    // Talking without a single pause for longer than the safety net.
    for (let i = 0; i < 40 && !full; i++) {
      const step = feed(d, 0.08, 1000);
      parts.push(...step.parts);
      full = step.full;
    }
    expect(full).toBe(true);
    expect(seconds(d.length)).toBeCloseTo(30, 0);
    expect(seconds(parts[parts.length - 1].to)).toBeCloseTo(30, 0);
  });

  it('nothing was heard if you never talk, or the room is just noisy', () => {
    const quiet = new Dictation();
    feed(quiet, 0.003, 5000);
    expect(quiet.heard).toBe(false);
    expect(quiet.finish()).toBeUndefined();
    const noisy = new Dictation();
    feed(noisy, 0.02, 5000);
    expect(noisy.heard).toBe(false);
  });

  it('cuts a long dictation at a pause after 8 s, so it is written while you talk', () => {
    const d = new Dictation();
    feed(d, 0.002, 300);
    const first = feed(d, 0.08, 9000); // 9 s talking
    expect(first.parts).toEqual([]);
    const pause = feed(d, 0.003, 500); // a breath between sentences
    expect(pause.parts).toHaveLength(1);
    const part = pause.parts[0];
    expect(seconds(part.voiceFrom)).toBeCloseTo(0.3, 1);
    expect(seconds(part.voiceTo)).toBeCloseTo(9.3, 1);
    feed(d, 0.08, 3000);
    const rest = d.finish();
    expect(rest && seconds(rest.voiceFrom)).toBeCloseTo(9.8, 1);
  });

  it('without pauses, cuts by 12 s at the quietest moment (between words)', () => {
    const d = new Dictation();
    feed(d, 0.002, 300);
    feed(d, 0.08, 9000);
    feed(d, 0.03, 200); // a dip between two words, too short to be a pause
    const step = feed(d, 0.08, 4000);
    expect(step.parts).toHaveLength(1);
    expect(seconds(step.parts[0].to)).toBeGreaterThan(9.3);
    expect(seconds(step.parts[0].to)).toBeLessThan(9.5);
  });

  it('a part is only the voice, a little around it, never past the part', () => {
    const audio = new Float32Array(16_000 * 20);
    const part: Part = {
      from: 16_000 * 5,
      to: 16_000 * 10,
      voiceFrom: 16_000 * 6,
      voiceTo: 16_000 * 9.9,
    };
    const slice = partAudio(audio, part);
    expect(seconds(slice.length)).toBeCloseTo(10 - 5.7, 2); // 0.3 s before; capped at the end
  });

  it('shows the clock as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(42_900)).toBe('0:42');
    expect(clock(120_000)).toBe('2:00');
  });
});

describe('the parts of a dictation', () => {
  const never = () => Promise.reject(new Error('no debería escribir acá'));

  it('the office writes them one at a time, in order, and they are joined', async () => {
    let busy = 0;
    let most = 0;
    const office = async (audio: Float32Array) => {
      most = Math.max(most, ++busy);
      await new Promise((r) => setTimeout(r, audio.length === 1 ? 20 : 1));
      busy--;
      return audio.length === 1 ? 'Jarvis, abrí un agente' : 'en development.';
    };
    const writer = new PartWriter(office, never);
    writer.add(new Float32Array(1));
    writer.add(new Float32Array(2));
    expect(await writer.text()).toBe('Jarvis, abrí un agente en development.');
    expect(most).toBe(1);
  });

  it('a part the office cannot write goes to the page, without holding up the next', async () => {
    const order: string[] = [];
    let release = () => {};
    const slowLocal = () =>
      new Promise<string>((resolve) => {
        release = () => resolve('Primera parte,');
      });
    const office = async (audio: Float32Array) => {
      order.push(`oficina ${audio.length}`);
      return audio.length === 1 ? undefined : 'segunda parte.';
    };
    const writer = new PartWriter(office, slowLocal);
    writer.add(new Float32Array(1));
    writer.add(new Float32Array(2));
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(['oficina 1', 'oficina 2']); // the second did not wait
    release();
    expect(await writer.text()).toBe('Primera parte, segunda parte.');
  });

  it('a part that fails or is a phantom does not lose the others', async () => {
    const writer = new PartWriter(async (audio) => {
      if (audio.length === 2) throw new Error('se cayó');
      return audio.length === 1 ? 'Primera parte.' : 'Gracias.';
    }, never);
    writer.add(new Float32Array(1));
    writer.add(new Float32Array(2));
    writer.add(new Float32Array(3));
    expect(await writer.text()).toBe('Primera parte.');
  });

  it('says why when no part could be written', async () => {
    const writer = new PartWriter(undefined, () => Promise.reject(new Error('sin oído')));
    writer.add(new Float32Array(1));
    await expect(writer.text()).rejects.toThrow('sin oído');
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
  it('is measured over the first quarter second and cut before sending', () => {
    const d = new Dictation();
    feed(d, 0.002, 1000); // the room
    feed(d, 0.08, 2000); // you talk
    feed(d, 0.002, 1200); // quiet, and you press to finish
    const part = d.finish();
    expect(part && seconds(part.voiceFrom)).toBeCloseTo(1, 1);
    expect(part && seconds(part.voiceTo)).toBeCloseTo(3, 1);
    const audio = partAudio(new Float32Array(16_000 * 4.2), part as Part);
    expect(seconds(audio.length)).toBeCloseTo(2.6, 1); // 2 s + 0.3 s on each side
  });

  it('a voice from the very start does not raise the noise floor', () => {
    const d = new Dictation();
    feed(d, 0.002, 250);
    feed(d, 0.05, 500);
    expect(d.heard).toBe(true);
  });
});
