import { useSyncExternalStore } from 'react';

import { Dictation, MAX_DICTATION_MS, partAudio, SAMPLE_RATE } from './dictation.js';
import type { EarsReply } from './whisperWorker.js';

/**
 * Jarvis's ears, in the office: the microphone, from one press to the next
 * (a silence never stops it: dictation.ts), then the office writes it down
 * with whisper.cpp on the graphics card (server/src/voice/gpuEars.ts), part
 * by part while you keep talking. When it cannot (no NVIDIA card, still
 * installing, it failed), Whisper in a worker (whisperWorker.ts) does it
 * here. Nothing leaves this PC; the models are downloaded once.
 */

export type EarsPhase = 'idle' | 'preparing' | 'listening' | 'transcribing';

export interface EarsState {
  phase: EarsPhase;
  /** When it started listening (Date.now()), for the clock. */
  since?: number;
  /** Downloading the model the first time (0-100). */
  percent?: number;
  /** What it understood last (shown a moment in the bar). */
  heard?: string;
  /** The last dictation reached the safety net and was sent by itself. */
  full?: boolean;
  error?: string;
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
    // Parts are written while it still listens: that phase is kept.
    const listening = state.phase === 'listening';
    if (msg.type === 'progress')
      set(listening ? { percent: msg.percent } : { phase: 'preparing', percent: msg.percent });
    else if (msg.type === 'text') waiting.get(msg.id)?.(msg.text);
    else if (msg.type === 'failed') {
      if (msg.id !== undefined) waiting.get(msg.id)?.(new Error(msg.reason));
      else {
        // Nothing waiting for it will be written now.
        for (const w of [...waiting.values()]) w(new Error(msg.reason));
        set({
          ...(listening ? {} : { phase: 'idle' as const }),
          error: `No pude preparar el oído: ${msg.reason}`,
        });
      }
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

/**
 * The parts of a dictation written down while you keep talking: the office
 * first, one part after the other (whisper.cpp takes one at a time, and a
 * part waiting in its queue would run out its time), and this page's Whisper
 * for a part the office could not write — without holding up the next ones.
 * Joined in the order you said them.
 */
export class PartWriter {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly texts: Promise<string | undefined>[] = [];
  private failure: unknown;
  private readonly office: OfficeEars;
  private readonly local: (audio: Float32Array) => Promise<string>;

  constructor(
    office: OfficeEars | undefined,
    local: (audio: Float32Array) => Promise<string> = transcribe,
  ) {
    this.office = office ?? (() => Promise.resolve(undefined));
    this.local = local;
  }

  add(audio: Float32Array): void {
    const seconds = audio.length / SAMPLE_RATE;
    const office = this.chain.then(() => this.office(audio).catch(() => undefined));
    this.chain = office;
    const text = office
      .then((written) => written ?? this.local(audio))
      .then(
        (raw) => heardText(raw, seconds),
        (err: unknown) => {
          this.failure = err;
          return undefined;
        },
      );
    this.texts.push(text);
  }

  /** Everything you said, joined; throws only if no part could be written. */
  async text(): Promise<string | undefined> {
    const parts = (await Promise.all(this.texts)).filter((t): t is string => !!t);
    if (parts.length === 0 && this.failure !== undefined) throw this.failure;
    return parts.length ? parts.join(' ') : undefined;
  }
}

/** The worklet that hands the microphone's samples to the page. */
const RECORDER = `class JarvisRec extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('jarvis-rec', JarvisRec);`;

let stopNow: (() => void) | undefined;

/** Stop listening now and send it (a press on the microphone or Alt+J). */
export function stopListening(): void {
  stopNow?.();
}

/**
 * Record until you press again (or the safety net), handing each part with
 * your voice to `onPart` as soon as it is cut. Resolves with whether you
 * said anything, and whether the safety net stopped it.
 */
async function record(
  onPart: (audio: Float32Array) => void,
): Promise<{ heard: boolean; full: boolean }> {
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
    const dictation = new Dictation();
    // The whole dictation, so a part is a slice of it (~7.7 MB at most).
    const audio = new Float32Array(Math.ceil((MAX_DICTATION_MS / 1000) * SAMPLE_RATE) + 4096);
    const full = await new Promise<boolean>((resolve) => {
      stopNow = () => {
        const part = dictation.finish();
        if (part) onPart(partAudio(audio, part));
        resolve(false);
      };
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const frame = e.data;
        if (dictation.length + frame.length > audio.length) return;
        audio.set(frame, dictation.length);
        let sum = 0;
        for (const s of frame) sum += s * s;
        const step = dictation.feed(Math.sqrt(sum / frame.length), frame.length);
        if (step.part) onPart(partAudio(audio, step.part));
        if (step.full) resolve(true);
      };
      source.connect(node);
      // The clock counts what is recorded (opening the microphone takes a moment).
      set({ since: Date.now() });
    });
    source.disconnect();
    node.port.onmessage = null;
    return { heard: dictation.heard, full };
  } finally {
    stopNow = undefined;
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
    URL.revokeObjectURL(url);
  }
}

/**
 * Listen once: from this press to the next one (pressing while it listens
 * finishes it), write it down and hand the text to `onText`. Says why in the
 * state when it could not.
 */
export async function listenOnce(
  onText: (text: string) => void,
  office?: OfficeEars,
): Promise<void> {
  if (state.phase === 'listening') return stopListening();
  if (state.phase !== 'idle') return;
  set({ phase: 'listening', since: Date.now(), error: undefined, heard: undefined, full: false });
  try {
    const writer = new PartWriter(office);
    const { heard, full } = await record((audio) => writer.add(audio));
    if (!heard) {
      set({
        phase: 'idle',
        since: undefined,
        error: 'No te escuché: probá de nuevo más cerca del micrófono.',
      });
      return;
    }
    set({ phase: 'transcribing', since: undefined, full });
    const text = await writer.text();
    set({ phase: 'idle', heard: text, error: text ? undefined : 'No entendí lo que dijiste.' });
    if (text) onText(text);
  } catch (err) {
    const denied = err instanceof DOMException && err.name === 'NotAllowedError';
    set({
      phase: 'idle',
      since: undefined,
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
