/**
 * Dictation by hand: you press once to start and once more to finish; a
 * silence never stops it (you may stay thinking). It only stops by itself at
 * MAX_DICTATION_MS, as a safety net.
 *
 * What you say is cut into parts at your pauses, and each part is written
 * down while you keep talking: whisper.cpp writes a part of up to 13 s fast
 * and well (longer audio needs the whole 30 s window and loops), so a long
 * dictation never waits for two minutes of audio at the end. Pure, so it is
 * tested.
 */

export const SAMPLE_RATE = 16_000;
/** Safety net: a dictation stops by itself after this long. */
export const MAX_DICTATION_MS = 120_000;
/** What is listened to as the room's noise before you speak. */
const NOISE_MS = 250;
/** Kept around the voice when the silence is cut: Whisper invents words in
 *  silence. */
const VOICE_PAD_MS = 300;
/** A part is cut at the first pause this long… */
const PAUSE_MS = 400;
/** …once it has lasted this long… */
const PART_MIN_MS = 8_000;
/** …and, with no pause, at the quietest moment before this. */
const PART_MAX_MS = 12_000;
/** Frames on each side averaged to find that quietest moment (~50 ms). */
const SMOOTH_FRAMES = 6;

const samples = (ms: number) => Math.round((ms / 1000) * SAMPLE_RATE);

/** A stretch of the dictation (in samples) with the voice inside it. */
export interface Part {
  from: number;
  to: number;
  voiceFrom: number;
  voiceTo: number;
}

interface Frame {
  at: number;
  length: number;
  rms: number;
  voice: boolean;
}

export class Dictation {
  /** You said something at some point. */
  heard = false;
  /** Samples fed so far. */
  length = 0;
  private floor = 0;
  private quiet = 0;
  private partFrom = 0;
  private frames: Frame[] = [];
  private readonly maxLength: number;

  constructor(maxMs = MAX_DICTATION_MS) {
    this.maxLength = samples(maxMs);
  }

  /**
   * Feed one frame's loudness (RMS) and length in samples. Returns a part
   * with your voice when one is ready to write down, and `full` when the
   * safety net is reached (the rest is in that part).
   */
  feed(rms: number, length: number): { part?: Part; full?: true } {
    const at = this.length;
    this.length += length;
    // The room's noise, from the first quarter second (frames are ~8 ms).
    if (this.length <= samples(NOISE_MS)) {
      this.floor = Math.max(this.floor, rms);
      this.frames.push({ at, length, rms, voice: false });
      return {};
    }
    const voice = rms > Math.max(0.012, this.floor * 2.5);
    if (voice) this.heard = true;
    this.quiet = voice ? 0 : this.quiet + length;
    this.frames.push({ at, length, rms, voice });
    if (this.length >= this.maxLength) return { part: this.finish(), full: true };
    const lasted = this.length - this.partFrom;
    if (lasted >= samples(PART_MIN_MS) && this.quiet >= samples(PAUSE_MS))
      return { part: this.cut(this.length) };
    if (lasted >= samples(PART_MAX_MS)) return { part: this.cut(this.quietestCut()) };
    return {};
  }

  /** The last part, when you finish (undefined if it has no voice). */
  finish(): Part | undefined {
    return this.cut(this.length);
  }

  /** Where the sound is lowest between PART_MIN_MS and now: between words. */
  private quietestCut(): number {
    const earliest = this.partFrom + samples(PART_MIN_MS);
    let best = this.length;
    let bestLevel = Infinity;
    for (let i = 0; i < this.frames.length; i++) {
      if (this.frames[i].at < earliest) continue;
      let sum = 0;
      let n = 0;
      for (let j = i - SMOOTH_FRAMES; j <= i + SMOOTH_FRAMES; j++) {
        if (j < 0 || j >= this.frames.length) continue;
        sum += this.frames[j].rms;
        n++;
      }
      if (sum / n < bestLevel) [best, bestLevel] = [this.frames[i].at, sum / n];
    }
    return best;
  }

  /** Close the part at `at` (a frame's start); undefined when it was silent. */
  private cut(at: number): Part | undefined {
    const from = this.partFrom;
    const inside = this.frames.filter((f) => f.at < at);
    this.frames = this.frames.filter((f) => f.at >= at);
    this.partFrom = at;
    const voiced = inside.filter((f) => f.voice);
    if (voiced.length === 0) return undefined;
    const last = voiced[voiced.length - 1];
    return { from, to: at, voiceFrom: voiced[0].at, voiceTo: last.at + last.length };
  }
}

/** The stretch of `audio` (the whole dictation) with the part's voice, and a
 *  little around it, never past the part. */
export function partAudio(audio: Float32Array, part: Part): Float32Array {
  const from = Math.max(part.from, part.voiceFrom - samples(VOICE_PAD_MS));
  const to = Math.min(part.to, audio.length, part.voiceTo + samples(VOICE_PAD_MS));
  return audio.slice(from, to);
}

/** «1:05», for the clock while it listens. */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
