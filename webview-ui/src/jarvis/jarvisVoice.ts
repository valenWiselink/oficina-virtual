import { useSyncExternalStore } from 'react';

import type { JarvisVoiceStatus } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import {
  arrived,
  emptyQueue,
  expiresAt,
  failed,
  finished,
  inLine,
  nextUp,
  queued,
  type SpeechQueue,
  type Utterance,
} from './speechQueue.js';

/**
 * Jarvis's mouth, in the office: its voice settings as the office has them,
 * whether you silenced it here, and what it is saying right now. The audio is
 * made by the office (server/src/voice/) and played in this window, one
 * answer after the other (speechQueue.ts).
 */

export interface JarvisVoiceState {
  /** As the office has it set (Ajustes); undefined until it answers. */
  status?: JarvisVoiceStatus;
  /** Silenced in this window (the bar's speaker button). */
  muted: boolean;
  /** What it is saying now, for the subtitles. */
  speaking?: { key: string; text: string };
  /** Why the last attempt said nothing (shown in Ajustes). */
  error?: string;
}

const MUTED_KEY = 'oficina.jarvis.mudo';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'si';
  } catch {
    return false;
  }
}

let state: JarvisVoiceState = { muted: readMuted() };
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | undefined;
let line: SpeechQueue = emptyQueue();
let expiry: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

function set(change: Partial<JarvisVoiceState>): void {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  if (msg.type === 'jarvisVoiceStatus') {
    set({ status: msg, error: msg.error });
  } else if (msg.type === 'jarvisVoice') {
    line = arrived(line, msg.key, `data:${msg.mime};base64,${msg.audio}`, msg.text);
    next();
  } else if (msg.type === 'jarvisVoiceFailed') {
    if (!inLine(line, msg.key)) return;
    line = failed(line, msg.key);
    set({ error: msg.reason });
    next();
  }
});

/** Say what comes next in line, if its turn came; true when it started. */
function next(): boolean {
  clearTimeout(expiry);
  const { queue, play: u } = nextUp(line, Date.now());
  line = queue;
  if (u) play(u);
  // The first in line may never get its audio: let it go when it is too old.
  const until = expiresAt(line);
  if (until !== undefined) expiry = setTimeout(next, Math.max(0, until - Date.now()) + 50);
  return !!u;
}

function play(u: Utterance): void {
  const a = new Audio(u.src);
  audio = a;
  set({ speaking: { key: u.key, text: u.text ?? '' }, error: undefined });
  const done = () => {
    if (audio !== a) return;
    audio = undefined;
    line = finished(line, u.key);
    // Straight into the next one, without the subtitles blinking in between.
    if (!next()) set({ speaking: undefined });
  };
  a.onended = done;
  a.onerror = done;
  void a.play().catch(() => {
    done();
    set({
      error: 'La ventana no dejó reproducir el audio: hacé un clic en la oficina y probá de nuevo.',
    });
  });
}

function ask(key: string, what: { id: number } | { text: string }): void {
  line = queued(line, { key, at: Date.now() });
  transport.send({ type: 'jarvisSay', key, ...what });
}

/** It speaks if a voice is set and you did not silence it here. */
export function voiceOn(s: JarvisVoiceState = state): boolean {
  return !!s.status && s.status.engine !== 'off' && !s.muted;
}

/** Say Jarvis's latest answer (agent `id`), after what it is saying now. */
export function sayLatest(id: number): void {
  if (!voiceOn()) return;
  ask(`respuesta-${id}-${++seq}`, { id });
}

/** Say a test phrase (Ajustes → Probar) right away, muted or not. */
export function sayTest(text: string): void {
  stopJarvis();
  ask(`prueba-${++seq}`, { text });
}

/** Quiet now: what it was saying stops and nothing in line is said (Esc,
 *  «Callar», talking to it). */
export function stopJarvis(): void {
  line = emptyQueue();
  clearTimeout(expiry);
  if (audio) {
    const a = audio;
    audio = undefined;
    a.pause();
  }
  if (state.speaking) set({ speaking: undefined });
}

export function setJarvisMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? 'si' : 'no');
  } catch {
    // Not kept: it applies to this window until it reloads.
  }
  if (muted) stopJarvis();
  set({ muted });
}

/** Ask the office for its voice settings (once per window). */
let asked = false;
export function requestJarvisVoice(): void {
  if (asked) return;
  asked = true;
  transport.send({ type: 'requestJarvisVoice' });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJarvisVoice(): JarvisVoiceState {
  return useSyncExternalStore(subscribe, () => state);
}
