import { useEffect, useState } from 'react';

import { clock, MAX_DICTATION_MS } from './dictation.js';
import type { EarsState } from './jarvisEars.js';

/**
 * What it understood, shown for a moment and gone (asked 2026-10-30: the
 * whole dictation stayed beside the bubble and atop its chat, covering the
 * office). Beside the bubble only its first lines; in the chat nothing but
 * the safety-net note, since what you said is already your message there.
 */

const NOTE_MIN_MS = 4000;
const NOTE_MAX_MS = 8000;
const NOTE_MS_PER_CHAR = 30;
/** The fade out (the class's duration). */
export const NOTE_FADE_MS = 500;

/** How long it stays: a moment, a little more for a longer text. */
export function heardNoteMs(text: string): number {
  return Math.min(NOTE_MAX_MS, NOTE_MIN_MS + text.length * NOTE_MS_PER_CHAR);
}

/** The note for what it heard last (undefined: nothing to say). */
export function heardNoteOf(ears: EarsState, inChat: boolean): string | undefined {
  if (ears.phase !== 'idle' || !ears.heard) return undefined;
  const full = ears.full ? `Llegaste a los ${clock(MAX_DICTATION_MS)} y se lo pasé.` : '';
  if (inChat) return full || undefined;
  return `${full ? `${full} ` : ''}Le dijiste: «${ears.heard}»`;
}

export type NotePhase = 'shown' | 'fading' | 'gone';

/**
 * A note keyed by `key` (a new key shows it again): shown for `ms`, then
 * faded out. Hovering it holds it; `dismiss` takes it away now.
 */
export function useFleetingNote(
  key: number | undefined,
  ms: number,
): { phase: NotePhase; hold: (on: boolean) => void; dismiss: () => void } {
  const [gone, setGone] = useState<number>();
  const [fading, setFading] = useState<number>();
  // Keyed too: a note closed under the pointer never holds the next one.
  const [heldKey, setHeldKey] = useState<number>();
  const held = key !== undefined && heldKey === key;

  useEffect(() => {
    if (key === undefined || held) return;
    const fade = setTimeout(() => setFading(key), ms);
    const hide = setTimeout(() => setGone(key), ms + NOTE_FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [key, ms, held]);

  const phase: NotePhase =
    key === undefined || gone === key ? 'gone' : fading === key ? 'fading' : 'shown';
  return {
    phase,
    hold: (on) => {
      setHeldKey(on ? key : undefined);
      if (on) setFading(undefined);
    },
    dismiss: () => setGone(key),
  };
}
