/**
 * What Jarvis says, in line: a new answer waits for the one it is saying to
 * end instead of cutting it. Only you cut it (talking over it, «Callar», Esc:
 * jarvisVoice.stopJarvis empties the line). Each answer's audio is asked of
 * the office as soon as it is said, so it is ready when its turn comes.
 *
 * What stops making sense is not said late:
 * - an answer that waited QUEUE_MAX_AGE_MS without starting is dropped
 *   (by then the screen and newer answers already told it);
 * - at most QUEUE_MAX_WAITING wait behind the one it is saying: a newer one
 *   pushes the oldest waiting one out.
 */

/** One thing to say: asked of the office at `at`; `src` once its audio is here. */
export interface Utterance {
  key: string;
  at: number;
  src?: string;
  text?: string;
}

export interface SpeechQueue {
  /** What it is saying now. */
  playing?: Utterance;
  /** What it says next, oldest first (their audio may still be on its way). */
  waiting: Utterance[];
}

export const QUEUE_MAX_WAITING = 2;
export const QUEUE_MAX_AGE_MS = 60_000;

export const emptyQueue = (): SpeechQueue => ({ waiting: [] });

/** A new answer to say, at the end of the line. */
export function queued(q: SpeechQueue, u: Utterance): SpeechQueue {
  const waiting = [...q.waiting, u];
  return { ...q, waiting: waiting.slice(Math.max(0, waiting.length - QUEUE_MAX_WAITING)) };
}

/** Its audio arrived (ignored when that answer already left the line). */
export function arrived(q: SpeechQueue, key: string, src: string, text: string): SpeechQueue {
  return { ...q, waiting: q.waiting.map((u) => (u.key === key ? { ...u, src, text } : u)) };
}

/** The office could not make its audio: it leaves the line. */
export function failed(q: SpeechQueue, key: string): SpeechQueue {
  return { ...q, waiting: q.waiting.filter((u) => u.key !== key) };
}

export function inLine(q: SpeechQueue, key: string): boolean {
  return q.playing?.key === key || q.waiting.some((u) => u.key === key);
}

/** It finished saying `key` (or could not play it). */
export function finished(q: SpeechQueue, key: string): SpeechQueue {
  return q.playing?.key === key ? { ...q, playing: undefined } : q;
}

/**
 * What to say now, if anything: the first in line once its audio is here,
 * after dropping what waited too long. Nothing while it is still talking.
 */
export function nextUp(q: SpeechQueue, now: number): { queue: SpeechQueue; play?: Utterance } {
  if (q.playing) return { queue: q };
  const waiting = q.waiting.filter((u) => now - u.at <= QUEUE_MAX_AGE_MS);
  const [first, ...rest] = waiting;
  if (!first?.src) return { queue: { waiting } };
  return { queue: { playing: first, waiting: rest }, play: first };
}

/** When the first in line, still without audio, stops being worth saying. */
export function expiresAt(q: SpeechQueue): number | undefined {
  const first = q.waiting[0];
  return !q.playing && first && !first.src ? first.at + QUEUE_MAX_AGE_MS : undefined;
}
