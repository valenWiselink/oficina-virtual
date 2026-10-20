import {
  CHEER_NOTES,
  CHEER_VOLUME,
  DONE_NOTES,
  DONE_VOLUME,
  PERMISSION_NOTES,
  PERMISSION_VOLUME,
  type SoundNote,
} from './constants.js';
import { isFocused, noteWhileFocused } from './focus/focusMode.js';

let soundEnabled = true;
let audioCtx: AudioContext | null = null;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
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

async function play(notes: readonly SoundNote[], volume: number, bell: boolean): Promise<void> {
  if (!soundEnabled) return;
  try {
    audioCtx ??= new AudioContext();
    // Resume a suspended context (browsers suspend it until a user gesture).
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    for (const note of notes) playNote(audioCtx, note, volume, bell);
  } catch {
    // Audio may not be available
  }
}

/** An agent finished its turn: the happy "plin" — silent in focus mode,
 *  where it is only counted for the summary. */
export function playDoneSound(): Promise<void> {
  if (isFocused()) {
    noteWhileFocused('termino');
    return Promise.resolve();
  }
  return play(DONE_NOTES, DONE_VOLUME, true);
}

/** Something needs you: the plain "toc-toc". */
export function playPermissionSound(): Promise<void> {
  return play(PERMISSION_NOTES, PERMISSION_VOLUME, false);
}

/** You marked "Hecho": a small sparkle (silent in focus mode). */
export function playCheerSound(): Promise<void> {
  if (isFocused()) return Promise.resolve();
  return play(CHEER_NOTES, CHEER_VOLUME, true);
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
