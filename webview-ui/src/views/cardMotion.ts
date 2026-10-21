import { useEffect, useMemo, useRef, useState } from 'react';

import type { AgentKind, AgentView } from './agentViews.js';
import { TRAVEL_MS } from './cardTravel.js';

/** How a card arrives: a new agent pops in, one that starts needing you hops. */
export type CardMotion = 'pop' | 'hop';

/** Long enough for the CSS animation to finish before the class goes (a hop
 *  starts once the card has travelled to "Te necesita"). */
export const MOTION_MS = TRAVEL_MS + 700;

/**
 * What moved since the last look: an agent never seen before pops in, one
 * that just started needing you hops. The first look (page load, reconnect)
 * moves nothing.
 */
export function diffMotions(
  before: ReadonlyMap<number, AgentKind> | null,
  views: readonly AgentView[],
): Map<number, CardMotion> {
  const motions = new Map<number, CardMotion>();
  if (!before) return motions;
  for (const v of views) {
    const was = before.get(v.id);
    if (was === undefined) motions.set(v.id, 'pop');
    else if (v.kind === 'needs' && was !== 'needs') motions.set(v.id, 'hop');
  }
  return motions;
}

/** A motion and when its animation is over. */
export interface TimedMotion {
  motion: CardMotion;
  until: number;
}

/** The motions with the fresh ones added, each lasting its own animation. */
export function addMotions(
  current: ReadonlyMap<number, TimedMotion>,
  fresh: ReadonlyMap<number, CardMotion>,
  now: number,
): Map<number, TimedMotion> {
  const next = new Map(current);
  for (const [id, motion] of fresh) next.set(id, { motion, until: now + MOTION_MS });
  return next;
}

/** The motions still playing (a few ms of slack, so a timer that fires a
 *  hair early still clears what it was set for). */
export function pruneMotions(
  current: ReadonlyMap<number, TimedMotion>,
  now: number,
): Map<number, TimedMotion> {
  return new Map([...current].filter(([, m]) => m.until > now + 16));
}

/** The board's card motions right now. Each lasts its own animation: a
 *  later change on the board neither cuts it short nor leaves it behind (a
 *  motion left behind would replay every time that card changes column). */
export function useCardMotions(views: readonly AgentView[]): Map<number, CardMotion> {
  const seen = useRef<Map<number, AgentKind> | null>(null);
  const [timed, setTimed] = useState<ReadonlyMap<number, TimedMotion>>(() => new Map());
  const signature = views.map((v) => `${v.id}:${v.kind}`).join(',');
  useEffect(() => {
    const fresh = diffMotions(seen.current, views);
    seen.current = new Map(views.map((v) => [v.id, v.kind]));
    if (fresh.size > 0) setTimed((current) => addMotions(current, fresh, Date.now()));
    // The signature is what changes: views itself is a new array every render.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (timed.size === 0) return;
    const ends = Math.min(...[...timed.values()].map((m) => m.until));
    const timer = setTimeout(
      () => setTimed((current) => pruneMotions(current, Date.now())),
      Math.max(0, ends - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [timed]);
  return useMemo(() => new Map([...timed].map(([id, m]) => [id, m.motion])), [timed]);
}
