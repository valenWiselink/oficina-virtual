import { useEffect, useSyncExternalStore } from 'react';

import {
  CHEER_NOTES,
  CHEER_VOLUME,
  DONE_NOTES,
  DONE_VOLUME,
  DOOR_SOUND,
  TETOCA_SOUND,
} from './constants.js';
import { isCalm } from './effects/calmMode.js';
import { scheduleNotes, scheduleWood } from './effects/soundSynth.js';
import { createTurnSounds } from './effects/turnSounds.js';
import { isFocused, noteWhileFocused } from './focus/focusMode.js';

/**
 * Ajustes → Sonidos: everything (the knock on the door when an agent is
 * blocked, the "te toca", a soft plin when a turn ends with nothing for you,
 * the sparkle on "Hecho"), only when you are needed, or nothing. Remembered
 * in this browser; "nothing" is also the office's saved on/off
 * (settingsLoaded.soundEnabled), so another window of the same office agrees.
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

/** Play, if the chosen mode lets this kind through (`needsYou`: it calls you). */
async function play(schedule: (ctx: AudioContext) => void, needsYou: boolean): Promise<void> {
  if (mode === 'none' || (mode === 'needs' && !needsYou)) return;
  try {
    audioCtx ??= new AudioContext();
    // Resume a suspended context (browsers suspend it until a user gesture).
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    schedule(audioCtx);
  } catch {
    // Audio may not be available
  }
}

/** A turn ended with nothing for you: the soft "plin" (spaced out by
 *  officeSounds; silent in focus mode, where it is only counted). */
function playDoneSound(): Promise<void> {
  if (isFocused()) return Promise.resolve();
  return play((ctx) => scheduleNotes(ctx, ctx.destination, DONE_NOTES, DONE_VOLUME, true), false);
}

/** An agent is blocked until you answer (a permission, a question): the
 *  knock on the door. Always the same, in focus and calm mode too. */
export function playPermissionSound(): Promise<void> {
  return play((ctx) => scheduleWood(ctx, ctx.destination, DOOR_SOUND), true);
}

/** A finished turn left you something ("te toca"): it does not block the
 *  agent, so it stays quiet in focus mode. */
function playTeTocaSound(): Promise<void> {
  if (isFocused()) return Promise.resolve();
  return play((ctx) => scheduleWood(ctx, ctx.destination, TETOCA_SOUND), true);
}

/** You marked "Hecho", or a PR got merged: a small sparkle. Decoration, so
 *  silent in focus and calm mode. */
export function playCheerSound(): Promise<void> {
  if (isFocused() || isCalm()) return Promise.resolve();
  return play((ctx) => scheduleNotes(ctx, ctx.destination, CHEER_NOTES, CHEER_VOLUME, true), false);
}

/** The agents whose terminal or chat is on screen (see useAgentsInView). */
let inView: ReadonlySet<number> = new Set();
/** When you last pressed a key in the office. */
let lastKeyAt = -Infinity;
/** A modifier pressed alone is not typing. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']);

if (typeof window !== 'undefined') {
  // Capture phase: the terminal stops its keys from bubbling.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!MODIFIERS.has(e.key)) lastKeyAt = Date.now();
    },
    true,
  );
}

function agentInView(agentId: number): boolean {
  const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
  return visible && inView.has(agentId);
}

/** Tell the sounds which agents' terminal or chat you have in front of you
 *  (the drawer's panes, or a phone's terminal page): their plin is not news. */
export function useAgentsInView(onScreen: ReadonlyArray<number | null>): void {
  const ids = onScreen.filter((id) => id !== null).join(',');
  useEffect(() => {
    inView = new Set(ids ? ids.split(',').map(Number) : []);
  }, [ids]);
}

/** The office's sounds for turn ends and new needs (effects/turnSounds.ts). */
export const officeSounds = createTurnSounds(
  {
    door: () => void playPermissionSound(),
    teToca: () => void playTeTocaSound(),
    finished: () => {
      if (isFocused()) noteWhileFocused('termino');
    },
    plin: () => void playDoneSound(),
  },
  () => Date.now(),
  { inView: agentInView, lastKeyAt: () => lastKeyAt },
);

/** Whether the office itself sounds for something that needs you: the
 *  chosen mode lets it through and the browser lets the page play (a tab
 *  needs a click or a key first). Then a Windows notice goes out silent:
 *  one sound, not two. */
export function officeSoundsForYou(): boolean {
  if (mode === 'none') return false;
  if (audioCtx?.state === 'running') return true;
  return typeof navigator === 'undefined' || navigator.userActivation?.hasBeenActive !== false;
}

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    // ignore
  }
}
