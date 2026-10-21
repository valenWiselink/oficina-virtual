import { useEffect } from 'react';

import { markSeen, noteFirstSight } from '../identity/seenStore.js';
import type { AgentView } from './agentViews.js';

/** "Terminó" with an answer that came after you last looked at it. A still,
 *  silent mark: it never moves or sounds. */
export function isUnread(v: AgentView, seen: number | undefined): boolean {
  return (
    v.kind === 'done' && v.lastRecordAt !== undefined && seen !== undefined && v.lastRecordAt > seen
  );
}

/** "Terminó": the latest answer first (agents without one go last). */
export function byLatest(a: AgentView, b: AgentView): number {
  const la = a.lastRecordAt ?? -Infinity;
  const lb = b.lastRecordAt ?? -Infinity;
  return la !== lb ? lb - la : a.id - b.id;
}

/**
 * Keep the looks up to date: an agent first seen counts as looked at from
 * now, and one whose chat or terminal is on screen is looked at as long as
 * it stays there (whatever it writes meanwhile is read).
 */
export function useReadMarks(views: AgentView[], onScreen: ReadonlyArray<number | null>): void {
  const keys = views.map((v) => v.key).join('\n');
  useEffect(() => {
    if (keys) noteFirstSight(keys.split('\n'), Date.now());
  }, [keys]);

  const open = views
    .filter((v) => onScreen.includes(v.id))
    .map((v) => ({ key: v.key, at: v.lastRecordAt ?? 0 }));
  const openSig = JSON.stringify(open);
  useEffect(() => {
    const now = Date.now();
    const looks = JSON.parse(openSig) as Array<{ key: string; at: number }>;
    markSeen(looks.map((l) => ({ key: l.key, at: Math.max(now, l.at) })));
  }, [openSig]);
}
