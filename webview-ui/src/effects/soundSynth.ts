import type { SoundNote, WoodHit, WoodSound } from '../constants.js';

/**
 * The office's sounds as Web Audio graphs, on any context: the page's own,
 * or an OfflineAudioContext that renders them to a file to listen to. Every
 * envelope is exponential: up in a few ms, then down to silence over the
 * note's ring.
 */

/** Exponential ramps cannot reach 0: this is silence. */
const SILENT = 0.0001;
/** How long a knuckle's thud takes to fall to the body's pitch. */
const THUD_S = 0.025;
/** The click of a hit: this much noise, band-passed this wide. */
const CLICK_S = 0.03;
const CLICK_Q = 1;

function envelope(param: AudioParam, t: number, peak: number, attack: number, ring: number): void {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + ring);
}

interface Tone {
  type: OscillatorType;
  hz: number;
  /** Where the pitch starts, falling to `hz` (the thud). */
  fromHz?: number;
  peak: number;
  attack: number;
  ring: number;
}

function tone(ctx: BaseAudioContext, dest: AudioNode, t: number, spec: Tone): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.fromHz ?? spec.hz, t);
  if (spec.fromHz !== undefined && spec.fromHz !== spec.hz) {
    osc.frequency.exponentialRampToValueAtTime(spec.hz, t + THUD_S);
  }
  envelope(gain.gain, t, spec.peak, spec.attack, spec.ring);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + spec.ring);
}

/** One noise buffer per context, reused by every click. */
const noiseOf = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseOf.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * CLICK_S), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseOf.set(ctx, buffer);
  }
  return buffer;
}

function click(ctx: BaseAudioContext, dest: AudioNode, t: number, hz: number, peak: number): void {
  const src = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noise(ctx);
  band.type = 'bandpass';
  band.frequency.setValueAtTime(hz, t);
  band.Q.setValueAtTime(CLICK_Q, t);
  envelope(gain.gain, t, peak, 0.001, CLICK_S);
  src.connect(band);
  band.connect(gain);
  gain.connect(dest);
  src.start(t);
  src.stop(t + CLICK_S);
}

function woodHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  start: number,
  sound: WoodSound,
  hit: WoodHit,
): void {
  const t = start + hit.at;
  const peak = sound.volume * (hit.force ?? 1);
  tone(ctx, dest, t, {
    type: 'sine',
    hz: hit.hz,
    fromHz: hit.hz * sound.thud,
    peak,
    attack: 0.003,
    ring: hit.ring,
  });
  if (sound.overtoneLevel > 0) {
    tone(ctx, dest, t, {
      type: 'sine',
      hz: hit.hz * sound.overtone,
      peak: peak * sound.overtoneLevel,
      attack: 0.002,
      ring: hit.ring * 0.45,
    });
  }
  if (sound.clickLevel > 0) click(ctx, dest, t, sound.clickHz, peak * sound.clickLevel);
}

/** A sound of the office's wood (the door, the "te toca"). */
export function scheduleWood(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sound: WoodSound,
  start = ctx.currentTime,
): void {
  for (const hit of sound.hits) woodHit(ctx, dest, start, sound, hit);
}

/** Notes rung like a little bell (a sine with a faint octave above it), or
 *  plain triangle taps when `bell` is false. The plin and the sparkle. */
export function scheduleNotes(
  ctx: BaseAudioContext,
  dest: AudioNode,
  notes: readonly SoundNote[],
  volume: number,
  bell: boolean,
  start = ctx.currentTime,
): void {
  const partials = bell
    ? [
        { k: 1, v: 1 },
        { k: 2, v: 0.25 },
      ]
    : [{ k: 1, v: 1 }];
  for (const note of notes) {
    for (const { k, v } of partials) {
      tone(ctx, dest, start + note.at, {
        type: bell ? 'sine' : 'triangle',
        hz: note.hz * k,
        peak: volume * v,
        attack: 0.008,
        ring: note.ring,
      });
    }
  }
}
