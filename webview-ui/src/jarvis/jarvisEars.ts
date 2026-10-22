import { useSyncExternalStore } from 'react';

import type { EarsReply } from './whisperWorker.js';

/**
 * Jarvis's ears, in the office: the microphone (it stops by itself after you
 * stop talking), and Whisper in a worker (whisperWorker.ts) turning it into
 * text. Nothing leaves this PC; the model is downloaded once.
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

/** Voice activity, frame by frame: started talking, and how long the quiet
 *  after it has lasted. Pure, so it is tested. */
export class SpeechGate {
  private floor = 0;
  private frames = 0;
  started = false;
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
    this.frames++;
    // The room's noise, from the first quarter second.
    if (this.frames <= 5) this.floor = Math.max(this.floor, rms);
    const threshold = Math.max(0.012, this.floor * 2.5);
    if (rms > threshold) {
      this.started = true;
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

/** The text worth sending to Jarvis, or nothing. */
export function heardText(raw: string): string | undefined {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 2 || PHANTOMS.some((p) => p.test(text))) return undefined;
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
    return audio;
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
export async function listenOnce(onText: (text: string) => void): Promise<void> {
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
    const text = heardText(await transcribe(audio));
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
