import { useSyncExternalStore } from 'react';

import {
  CHEER_NOTES,
  CHEER_VOLUME,
  DONE_NOTES,
  DONE_VOLUME,
  PERMISSION_NOTES,
  PERMISSION_VOLUME,
  type SoundNote,
} from './constants.js';
import { createTurnSounds } from './effects/turnSounds.js';
import { isFocused, noteWhileFocused } from './focus/focusMode.js';

/**
 * Ajustes → Sonidos: everything (the toc-toc when you are needed, a soft plin
 * when a turn ends with nothing for you, the sparkle on "Hecho"), only when
 * you are needed, or nothing. Remembered in this browser; "nothing" is also
 * the office's saved on/off (settingsLoaded.soundEnabled), so another window
 * of the same office agrees.
 */
export type SoundMode = 'all' | 'needs' | 'none';

export const SOUND_MODES: ReadonlyArray<{ id: SoundMode; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'needs', label: 'Sólo cuando te necesitan' },
  { id: 'none', label: 'Nada' },
];

const KEY = 'oficina.sonidos';
const listeners = new Set<() => void>();

function stored(): SoundMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'all' || v === 'needs' || v === 'none' ? v : null;
  } catch {
    return null;
  }
}

let mode: SoundMode = stored() ?? 'all';
let audioCtx: AudioContext | null = null;

function setMode(next: SoundMode): void {
  mode = next;
  for (const l of listeners) l();
}

/** Chosen in Ajustes: remembered here, and on/off told to the office. */
export function chooseSoundMode(next: SoundMode, tellOffice: (on: boolean) => void): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* blocked storage: it lasts this tab */
  }
  setMode(next);
  tellOffice(next !== 'none');
}

/** The office's saved on/off: off is "Nada"; on keeps what this browser chose
 *  (or "Todo" when it had chosen "Nada"). */
export function applySavedSound(enabled: boolean): void {
  if (!enabled) setMode('none');
  else if (mode === 'none') setMode(stored() === 'needs' ? 'needs' : 'all');
}

export function useSoundMode(): SoundMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mode,
  );
}

/** One note: a sine with a faint octave above it (a bell, not a beep) for
 *  `bell`, a plain triangle tap otherwise. */
function playNote(ctx: AudioContext, note: SoundNote, volume: number, bell: boolean): void {
  const t = ctx.currentTime + note.at;
  const partials = bell
    ? [
        { k: 1, v: 1 },
        { k: 2, v: 0.25 },
      ]
    : [{ k: 1, v: 1 }];
  for (const { k, v } of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = bell ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(note.hz * k, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume * v, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + note.ring);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.ring);
  }
}

/** Play, if the chosen mode lets this kind through (`needsYou`: it calls you). */
async function play(
  notes: readonly SoundNote[],
  volume: number,
  bell: boolean,
  needsYou: boolean,
): Promise<void> {
  if (mode === 'none' || (mode === 'needs' && !needsYou)) return;
  try {
    audioCtx ??= new AudioContext();
    // Resume a suspended context (browsers suspend it until a user gesture).
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    for (const note of notes) playNote(audioCtx, note, volume, bell);
  } catch {
    // Audio may not be available
  }
}

/** A turn ended with nothing for you: the soft "plin" (spaced out by
 *  officeSounds; silent in focus mode, where it is only counted). */
function playDoneSound(): Promise<void> {
  if (isFocused()) return Promise.resolve();
  return play(DONE_NOTES, DONE_VOLUME, true, false);
}

/** Something needs you: the plain "toc-toc" (a permission, a question, a
 *  "te toca"). A wait that does not block the agent stays quiet in focus mode. */
export function playPermissionSound(urgent = true): Promise<void> {
  if (!urgent && isFocused()) return Promise.resolve();
  return play(PERMISSION_NOTES, PERMISSION_VOLUME, false, true);
}

/** You marked "Hecho": a small sparkle (silent in focus mode). */
export function playCheerSound(): Promise<void> {
  if (isFocused()) return Promise.resolve();
  return play(CHEER_NOTES, CHEER_VOLUME, true, false);
}

/** The office's sounds for turn ends and new needs (effects/turnSounds.ts). */
export const officeSounds = createTurnSounds({
  knock: (urgent) => void playPermissionSound(urgent),
  finished: () => {
    if (isFocused()) noteWhileFocused('termino');
  },
  plin: () => void playDoneSound(),
});

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    // ignore
  }
}

/** A low wooden "bonk" (G3, a plain tap). */
const BONK_NOTES: readonly SoundNote[] = [{ hz: 196, at: 0, ring: 0.22 }];
const BONK_VOLUME = 0.16;

/** Something you sent did not reach the agent's terminal: the "bonk" beside
 *  the text that says so. It answers your own action, so it is information:
 *  it plays in focus and calm mode, and with "Sólo cuando te necesitan". */
export function playBonkSound(): Promise<void> {
  return play(BONK_NOTES, BONK_VOLUME, false, true);
}
