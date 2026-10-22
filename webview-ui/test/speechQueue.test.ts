import { describe, expect, it } from 'vitest';

import {
  arrived,
  emptyQueue,
  expiresAt,
  failed,
  finished,
  nextUp,
  QUEUE_MAX_AGE_MS,
  queued,
  type SpeechQueue,
} from '../src/jarvis/speechQueue.js';

describe('what Jarvis says, in line', () => {
  const ask = (q: SpeechQueue, key: string, at: number) => queued(q, { key, at });
  const audio = (q: SpeechQueue, key: string) => arrived(q, key, `audio-${key}`, `texto ${key}`);
  /** Takes what to say now (if anything) and returns the line after it. */
  const step = (q: SpeechQueue, now: number, said: string[]) => {
    const r = nextUp(q, now);
    if (r.play) said.push(r.play.key);
    return r.queue;
  };

  it('a new answer waits for the one it is saying to end', () => {
    const said: string[] = [];
    let q = audio(ask(emptyQueue(), 'a', 0), 'a');
    q = step(q, 10, said);
    expect(said).toEqual(['a']);
    q = audio(ask(q, 'b', 20), 'b');
    q = step(q, 30, said);
    expect(said).toEqual(['a']); // «a» is not cut
    step(finished(q, 'a'), 40, said);
    expect(said).toEqual(['a', 'b']);
  });

  it('in the order they were said, even when a later audio arrives first', () => {
    const said: string[] = [];
    let q = ask(ask(emptyQueue(), 'a', 0), 'b', 5);
    q = step(audio(q, 'b'), 10, said);
    expect(said).toEqual([]); // «b» waits for «a»
    q = step(audio(q, 'a'), 20, said);
    step(finished(q, 'a'), 30, said);
    expect(said).toEqual(['a', 'b']);
  });

  it('drops an answer that waited too long, and the line goes on', () => {
    const said: string[] = [];
    let q = audio(ask(emptyQueue(), 'a', 0), 'a');
    q = step(q, 0, said);
    q = audio(ask(q, 'viejo', 1_000), 'viejo');
    q = audio(ask(q, 'nuevo', QUEUE_MAX_AGE_MS), 'nuevo');
    step(finished(q, 'a'), QUEUE_MAX_AGE_MS + 2_000, said);
    expect(said).toEqual(['a', 'nuevo']);
  });

  it('keeps only the newest waiting ones when the line grows', () => {
    let q = audio(ask(emptyQueue(), 'a', 0), 'a');
    q = step(q, 0, []);
    for (const k of ['b', 'c', 'd']) q = ask(q, k, 10);
    expect(q.waiting.map((u) => u.key)).toEqual(['c', 'd']);
    // The audio of the one pushed out is not said when it arrives.
    expect(audio(q, 'b').waiting.some((u) => u.src === 'audio-b')).toBe(false);
  });

  it('skips an answer whose audio could not be made', () => {
    const said: string[] = [];
    const q = ask(ask(emptyQueue(), 'a', 0), 'b', 5);
    step(failed(audio(q, 'b'), 'a'), 10, said);
    expect(said).toEqual(['b']);
  });

  it('lets go of an answer whose audio never comes', () => {
    let q = ask(emptyQueue(), 'a', 100);
    expect(expiresAt(q)).toBe(100 + QUEUE_MAX_AGE_MS);
    q = nextUp(q, 100 + QUEUE_MAX_AGE_MS + 1).queue;
    expect(q).toEqual({ waiting: [] });
    expect(expiresAt(q)).toBeUndefined();
  });
});
