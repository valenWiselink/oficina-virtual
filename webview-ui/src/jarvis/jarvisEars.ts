import { useSyncExternalStore } from 'react';

import type { EarsReply } from './whisperWorker.js';

/**
 * Jarvis's ears, in the office: the microphone (it stops by itself after you
 * stop talking), then the office writes it down with whisper.cpp on the
 * graphics card (server/src/voice/gpuEars.ts). When it cannot (no NVIDIA
 * card, still installing, it failed), Whisper in a worker (whisperWorker.ts)
 * does it here. Nothing leaves this PC; the models are downloaded once.
 */

export type EarsPhase = 'idle' | 'preparing' | 'listening' | 'transcribing';

export interface EarsState {
  phase: EarsPhase;
  /** Downloading the model the first time (0-100). */
  percent?: number;
  /** What it understood last (shown a moment in the bar). */
  heard?: string;
  error?: string;
}

const SAMPLE_RATE = 16_000;
/** What is listened to as the room's noise before you speak. */
const NOISE_MS = 250;
/** Kept around the voice when the silence is cut. */
const VOICE_PAD_MS = 300;

/** Voice activity, frame by frame: started talking, and how long the quiet
 *  after it has lasted. Pure, so it is tested. */
export class SpeechGate {
  private floor = 0;
  started = false;
  /** When the voice began and last sounded (ms from the start), to cut the
   *  silence around it: Whisper invents words in silence. */
  firstVoiceMs = 0;
  lastVoiceMs = 0;
  private quietMs = 0;
  private elapsedMs = 0;
  private readonly silenceMs: number;
  private readonly noSpeechMs: number;
  private readonly maxMs: number;

  constructor(silenceMs = 1200, noSpeechMs = 7000, maxMs = 30_000) {
    this.silenceMs = silenceMs;
    this.noSpeechMs = noSpeechMs;
    this.maxMs = maxMs;
  }

  /** Feed one frame's loudness (RMS) and length; returns whether to stop. */
  feed(rms: number, ms: number): 'more' | 'done' | 'nothing' {
    this.elapsedMs += ms;
    // The room's noise, from the first quarter second (frames are ~8 ms).
    if (this.elapsedMs <= NOISE_MS) {
      this.floor = Math.max(this.floor, rms);
      return 'more';
    }
    const threshold = Math.max(0.012, this.floor * 2.5);
    if (rms > threshold) {
      if (!this.started) this.firstVoiceMs = this.elapsedMs - ms;
      this.started = true;
      this.lastVoiceMs = this.elapsedMs;
      this.quietMs = 0;
    } else if (this.started) {
      this.quietMs += ms;
    }
    if (this.elapsedMs >= this.maxMs) return this.started ? 'done' : 'nothing';
    if (this.started && this.quietMs >= this.silenceMs) return 'done';
    if (!this.started && this.elapsedMs >= this.noSpeechMs) return 'nothing';
    return 'more';
  }
}

/** What Whisper writes for silence or noise, not for you. */
const PHANTOMS = [
  /^gracias( por (ver|mirar)( el video)?)?[.!]*$/i,
  /subt[ií]tulos/i,
  /^\[.*\]$/,
  /^\(.*\)$/,
  /^[.…\s]*$/,
  /amara\.org/i,
  /suscr[ií]bete/i,
];

/** A phrase said this many times in a row is Whisper stuck in a loop. */
const LOOP_REPEATS = 4;
const LOOP_MAX_WORDS = 6;
/** Nobody says more than this many characters per second. */
const CHARS_PER_SECOND = 25;

const plain = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** «sí, sí, sí, sí…» (or any phrase of up to 6 words, 4 times or more) said once. */
export function withoutLoops(text: string): string {
  const words = text.split(' ');
  const keys = words.map(plain);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let skipped = false;
    for (let n = 1; n <= LOOP_MAX_WORDS && !skipped; n++) {
      const same = (k: number) =>
        keys.slice(i, i + n).every((w, j) => w !== '' && w === keys[i + k * n + j]);
      let times = 1;
      while (i + (times + 1) * n <= words.length && same(times)) times++;
      if (times >= LOOP_REPEATS) {
        // The last one keeps the punctuation that closes the phrase.
        out.push(...words.slice(i + (times - 1) * n, i + times * n));
        i += times * n;
        skipped = true;
      }
    }
    if (!skipped) out.push(words[i++]);
  }
  return out.join(' ');
}

/** The text worth sending to Jarvis, or nothing: no phantoms, no loops, and
 *  no more than `seconds` of talk can hold. */
export function heardText(raw: string, seconds = 30): string | undefined {
  let text = withoutLoops(raw.replace(/\s+/g, ' ').trim());
  if (text.length < 2 || PHANTOMS.some((p) => p.test(text))) return undefined;
  const max = Math.max(80, Math.round(seconds * CHARS_PER_SECOND));
  if (text.length > max) text = `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return text;
}

let state: EarsState = { phase: 'idle' };
const listeners = new Set<() => void>();
function set(change: Partial<EarsState>): void {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

let worker: Worker | undefined;
let nextId = 0;
const waiting = new Map<number, (text: string | Error) => void>();

function ears(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<EarsReply>) => {
    const msg = e.data;
    if (msg.type === 'progress') set({ phase: 'preparing', percent: msg.percent });
    else if (msg.type === 'text') waiting.get(msg.id)?.(msg.text);
    else if (msg.type === 'failed') {
      if (msg.id !== undefined) waiting.get(msg.id)?.(new Error(msg.reason));
      else set({ phase: 'idle', error: `No pude preparar el oído: ${msg.reason}` });
    }
  };
  return worker;
}

function transcribe(audio: Float32Array): Promise<string> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => {
      waiting.delete(id);
      if (r instanceof Error) reject(r);
      else resolve(r);
    });
    ears().postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
  });
}

/** 16-bit little-endian PCM, base64: what the office's whisper.cpp reads. */
export function pcm16Base64(audio: Float32Array): string {
  const bytes = new Uint8Array(audio.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Someone that may write it down first (the office's whisper.cpp,
 *  officeEars.ts): the text — '' when it heard no voice — or undefined when
 *  it could not. */
export type OfficeEars = (audio: Float32Array) => Promise<string | undefined>;

/** What you said as text: the office first, this page's Whisper if it cannot. */
async function writeDown(audio: Float32Array, office?: OfficeEars): Promise<string> {
  const text = office ? await office(audio).catch(() => undefined) : undefined;
  return text ?? transcribe(audio);
}

/** The worklet that hands the microphone's samples to the page. */
const RECORDER = `class JarvisRec extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('jarvis-rec', JarvisRec);`;

let stopNow: (() => void) | undefined;

/** Stop listening now (a click on the microphone again). */
export function stopListening(): void {
  stopNow?.();
}

/** The stretch with your voice, and a little around it. */
export function voiceOnly(audio: Float32Array, gate: SpeechGate): Float32Array {
  const at = (ms: number) => Math.round((ms / 1000) * SAMPLE_RATE);
  const from = Math.max(0, at(gate.firstVoiceMs - VOICE_PAD_MS));
  const to = Math.min(audio.length, at(gate.lastVoiceMs + VOICE_PAD_MS));
  return to > from ? audio.slice(from, to) : audio;
}

/** Record until you stop talking; null if you said nothing. */
async function record(): Promise<Float32Array | null> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const url = URL.createObjectURL(new Blob([RECORDER], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'jarvis-rec');
    const chunks: Float32Array[] = [];
    const gate = new SpeechGate();
    const result = await new Promise<'done' | 'nothing'>((resolve) => {
      stopNow = () => resolve(gate.started ? 'done' : 'nothing');
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const frame = e.data;
        chunks.push(frame);
        let sum = 0;
        for (const s of frame) sum += s * s;
        const verdict = gate.feed(
          Math.sqrt(sum / frame.length),
          (frame.length / SAMPLE_RATE) * 1000,
        );
        if (verdict !== 'more') resolve(verdict);
      };
      source.connect(node);
    });
    source.disconnect();
    node.port.onmessage = null;
    if (result === 'nothing') return null;
    const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      audio.set(c, at);
      at += c.length;
    }
    return voiceOnly(audio, gate);
  } finally {
    stopNow = undefined;
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
    URL.revokeObjectURL(url);
  }
}

/**
 * Listen once: record what you say, write it down, and hand the text to
 * `onText`. Says why in the state when it could not.
 */
export async function listenOnce(
  onText: (text: string) => void,
  office?: OfficeEars,
): Promise<void> {
  if (state.phase === 'listening') return stopListening();
  if (state.phase !== 'idle') return;
  set({ phase: 'listening', error: undefined, heard: undefined });
  try {
    const audio = await record();
    if (!audio) {
      set({ phase: 'idle', error: 'No te escuché: probá de nuevo más cerca del micrófono.' });
      return;
    }
    set({ phase: 'transcribing' });
    const text = heardText(await writeDown(audio, office), audio.length / SAMPLE_RATE);
    set({ phase: 'idle', heard: text, error: text ? undefined : 'No entendí lo que dijiste.' });
    if (text) onText(text);
  } catch (err) {
    const denied = err instanceof DOMException && err.name === 'NotAllowedError';
    set({
      phase: 'idle',
      error: denied
        ? 'Windows no deja usar el micrófono: Configuración → Privacidad → Micrófono.'
        : `No pude escuchar: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJarvisEars(): EarsState {
  return useSyncExternalStore(subscribe, () => state);
}
