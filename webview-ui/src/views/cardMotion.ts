import { useEffect, useRef, useState } from 'react';

import type { AgentKind, AgentView } from './agentViews.js';
import { TRAVEL_MS } from './cardTravel.js';

/** How a card arrives: a new agent pops in, one that starts needing you hops. */
export type CardMotion = 'pop' | 'hop';

/** Long enough for the CSS animation to finish before the class goes (a hop
 *  starts once the card has travelled to "Te necesita"). */
const MOTION_MS = TRAVEL_MS + 700;

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

/** The board's card motions right now (each lasts one animation). */
export function useCardMotions(views: readonly AgentView[]): Map<number, CardMotion> {
  const seen = useRef<Map<number, AgentKind> | null>(null);
  const [motions, setMotions] = useState<Map<number, CardMotion>>(() => new Map());
  const signature = views.map((v) => `${v.id}:${v.kind}`).join(',');
  useEffect(() => {
    const fresh = diffMotions(seen.current, views);
    seen.current = new Map(views.map((v) => [v.id, v.kind]));
    if (fresh.size === 0) return;
    setMotions(fresh);
    const timer = setTimeout(() => setMotions(new Map()), MOTION_MS);
    return () => clearTimeout(timer);
    // The signature is what changes: views itself is a new array every render.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  return motions;
}
