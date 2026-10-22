import { useSyncExternalStore } from 'react';

import type { JarvisVoiceStatus } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/**
 * Jarvis's mouth, in the office: its voice settings as the office has them,
 * whether you silenced it here, and what it is saying right now. The audio is
 * made by the office (server/src/voice/) and played in this window.
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
let wanted: string | undefined;
let seq = 0;

function set(change: Partial<JarvisVoiceState>): void {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  if (msg.type === 'jarvisVoiceStatus') {
    set({ status: msg, error: msg.error });
  } else if (msg.type === 'jarvisVoice') {
    if (msg.key !== wanted) return;
    play(msg.key, msg.text, `data:${msg.mime};base64,${msg.audio}`);
  } else if (msg.type === 'jarvisVoiceFailed') {
    if (msg.key !== wanted) return;
    wanted = undefined;
    set({ error: msg.reason });
  }
});

function play(key: string, text: string, src: string): void {
  stopJarvis();
  const a = new Audio(src);
  audio = a;
  set({ speaking: { key, text }, error: undefined });
  const done = () => {
    if (audio !== a) return;
    audio = undefined;
    set({ speaking: undefined });
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

/** It speaks if a voice is set and you did not silence it here. */
export function voiceOn(s: JarvisVoiceState = state): boolean {
  return !!s.status && s.status.engine !== 'off' && !s.muted;
}

/** Say Jarvis's latest answer (agent `id`). */
export function sayLatest(id: number): void {
  if (!voiceOn()) return;
  wanted = `respuesta-${id}-${++seq}`;
  transport.send({ type: 'jarvisSay', key: wanted, id });
}

/** Say a test phrase (Ajustes → Probar), muted or not. */
export function sayTest(text: string): void {
  wanted = `prueba-${++seq}`;
  transport.send({ type: 'jarvisSay', key: wanted, text });
}

/** Quiet now: what it was saying stops (Esc, «Callar», talking to it). */
export function stopJarvis(): void {
  wanted = undefined;
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
