/**
 * The presentation's sounds, synthesized with Web Audio (no audio files):
 * a soft pad under every scene plus one cue per thing that happens on screen
 * (pops, footsteps, key taps, the "needs you" ding, the cheer). Muting is
 * remembered per browser; the app's own notification sounds are separate.
 */
const KEY = 'oficina.presentacionSonido';

export type Cue =
  'whoosh' | 'pop' | 'step' | 'tap' | 'click' | 'send' | 'ding' | 'cheer' | 'chime' | 'goodnight';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let pad: { stop: (fadeS: number) => void } | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function introSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'no';
  } catch {
    return true;
  }
}

export function setIntroSound(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'si' : 'no');
  } catch {
    /* blocked storage: only for this time */
  }
  if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
}

/** The shared context, resumed (browsers keep it suspended until a gesture). */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = introSoundOn() ? 1 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return master ? { ctx, out: master } : null;
  } catch {
    return null;
  }
}

/** Call from a click or key press: unlocks audio in a browser tab. */
export function wakeIntroSound(): void {
  audio();
}

function tone(
  hz: number,
  at: number,
  ring: number,
  volume: number,
  type: OscillatorType = 'sine',
  glideTo?: number,
): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + ring * 0.6);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ring);
  osc.connect(gain).connect(a.out);
  osc.start(t);
  osc.stop(t + ring + 0.05);
}

/** A bell: the note with a faint octave above it. */
function bell(hz: number, at: number, ring: number, volume: number): void {
  tone(hz, at, ring, volume);
  tone(hz * 2, at, ring * 0.6, volume * 0.22);
}

/** Filtered noise: whooshes, footsteps and key taps. */
function noise(
  at: number,
  dur: number,
  volume: number,
  filter: BiquadFilterType,
  fromHz: number,
  toHz = fromHz,
): void {
  const a = audio();
  if (!a) return;
  if (!noiseBuffer) {
    noiseBuffer = a.ctx.createBuffer(1, a.ctx.sampleRate, a.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    // Deterministic noise (no Math.random): a cheap LCG is plenty for hiss.
    let seed = 7;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      data[i] = (seed / 1073741824 - 1) * 0.9;
    }
  }
  const t = a.ctx.currentTime + at;
  const src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const bandpass = a.ctx.createBiquadFilter();
  bandpass.type = filter;
  bandpass.Q.value = 1.2;
  bandpass.frequency.setValueAtTime(fromHz, t);
  bandpass.frequency.exponentialRampToValueAtTime(toHz, t + dur);
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.02, dur / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bandpass).connect(gain).connect(a.out);
  src.start(t, (at * 0.37) % 0.5);
  src.stop(t + dur + 0.05);
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const B5 = 987.77;
const C6 = 1046.5;

/** Play one cue now; `variant` shifts pitch a little (taps, pops in a row). */
export function cue(name: Cue, variant = 0): void {
  const shift = 1 + (variant % 5) * 0.06;
  switch (name) {
    case 'whoosh':
      noise(0, 0.42, 0.05, 'bandpass', 380, 2600);
      break;
    case 'pop':
      tone(480 * shift, 0, 0.12, 0.09, 'sine', 900 * shift);
      break;
    case 'step':
      noise(0, 0.05, 0.05, 'lowpass', 700 * shift);
      break;
    case 'tap':
      noise(0, 0.03, 0.035, 'highpass', 2400 * shift);
      break;
    case 'click':
      tone(1700, 0, 0.04, 0.06, 'triangle');
      noise(0, 0.03, 0.04, 'highpass', 3000);
      break;
    case 'send':
      tone(560, 0, 0.18, 0.07, 'sine', 1250);
      break;
    case 'ding':
      bell(E5 * 1.25, 0, 0.5, 0.07);
      bell(G5 * 1.25, 0.14, 0.7, 0.07);
      break;
    case 'cheer':
      [C6, E5 * 2, G5 * 2, C6 * 2].forEach((hz, i) => bell(hz * 0.5 * shift, i * 0.07, 0.6, 0.06));
      break;
    case 'chime':
      [C5, E5, G5, B5].forEach((hz, i) => bell(hz, i * 0.11, 1.4, 0.045));
      break;
    case 'goodnight':
      [G5, E5, C5].forEach((hz, i) => bell(hz, i * 0.22, 1.2, 0.05));
      break;
  }
}

/** Pad chords (roots of a I–vi–IV–V loop, an octave low), one per scene. */
const PAD_CHORDS: readonly (readonly number[])[] = [
  [130.81, 164.81, 196.0],
  [110.0, 130.81, 164.81],
  [87.31, 110.0, 130.81],
  [98.0, 123.47, 146.83],
];

/** Start (or move) the soft pad under the scenes: a slow, filtered chord. */
export function padTo(sceneIndex: number): void {
  const a = audio();
  if (!a) return;
  pad?.stop(1.2);
  const chord = PAD_CHORDS[sceneIndex % PAD_CHORDS.length];
  const t = a.ctx.currentTime;
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.022, t + 1.4);
  const lowpass = a.ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  lowpass.connect(gain).connect(a.out);
  const oscs = chord.flatMap((hz) =>
    [-4, 4].map((cents) => {
      const osc = a.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      osc.detune.value = cents;
      osc.connect(lowpass);
      osc.start(t);
      return osc;
    }),
  );
  pad = {
    stop: (fadeS) => {
      const now = a.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
      oscs.forEach((o) => o.stop(now + fadeS + 0.1));
    },
  };
}

export function stopPad(): void {
  pad?.stop(0.8);
  pad = null;
}
