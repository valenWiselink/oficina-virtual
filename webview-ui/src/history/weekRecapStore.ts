import { useEffect, useState, useSyncExternalStore } from 'react';

import type { WeekRecap } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/** A week's numbers from the server's saved histories (weekRecap), by its
 *  Monday (AAAA-MM-DD): asked when the Friday summary or Monday wants it. */
const recaps = new Map<string, WeekRecap>();
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  if (msg.type !== 'weekRecap') return;
  const recap = msg as unknown as WeekRecap;
  recaps.set(recap.monday, recap);
  for (const l of listeners) l();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** An office older than this page never answers: give up after this. */
const ANSWER_TIMEOUT_MS = 6000;

/**
 * The week starting on `monday` (none: nothing asked). `undefined` while the
 * answer is on its way, `null` when it did not come.
 */
export function useWeekRecap(monday: string | undefined): WeekRecap | null | undefined {
  const recap = useSyncExternalStore(subscribe, () =>
    monday === undefined ? undefined : recaps.get(monday),
  );
  const [gaveUp, setGaveUp] = useState<string>();
  useEffect(() => {
    if (monday === undefined || recaps.has(monday)) return;
    transport.send({ type: 'requestWeekRecap', monday });
    const timer = setTimeout(() => setGaveUp(monday), ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [monday]);
  if (recap) return recap;
  return monday !== undefined && gaveUp === monday ? null : undefined;
}
