import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { AgentView } from './agentViews.js';
import type { Box } from './graphHit.js';
import { overSpot } from './graphHover.js';
import { pillActs } from './graphPick.js';
import type { GraphControls } from './useGraphCanvas.js';

/** How long the grown pill waits for the mouse to come back before it
 *  shrinks (moving from the pill to its buttons crosses a gap). */
const PILL_GRACE_MS = 350;
const PILL_SLACK_PX = 10;
/** After you act on a pill, the mouse resting on it does not grow it again
 *  while the office catches up (the answer reaches the agent). */
const PILL_QUIET_MS = 1500;

/** Put the grown pill over its pill (screen box `box`). */
function placeOver(el: HTMLDivElement, box: Box, root: HTMLElement): void {
  const size = { w: el.offsetWidth, h: el.offsetHeight };
  const spot = overSpot(box, size, { w: root.clientWidth, h: root.clientHeight });
  el.style.transform = `translate(${Math.round(spot.left)}px, ${Math.round(spot.top)}px)`;
  el.style.visibility = 'visible';
}

/** The mouse is on the grown pill (or just around it). */
function mouseOn(el: HTMLDivElement, m: { x: number; y: number } | null): boolean {
  const r = el.getBoundingClientRect();
  return (
    !!m &&
    m.x >= r.left - PILL_SLACK_PX &&
    m.x <= r.right + PILL_SLACK_PX &&
    m.y >= r.top - PILL_SLACK_PX &&
    m.y <= r.bottom + PILL_SLACK_PX
  );
}

/** Where the mouse is over the graph (page coords), or null when it left. */
function useMouse() {
  const at = useRef<{ x: number; y: number } | null>(null);
  return {
    at,
    track: (e: ReactPointerEvent) => {
      at.current = { x: e.clientX, y: e.clientY };
    },
    forget: () => {
      at.current = null;
    },
  };
}

/**
 * Which request pill is grown into its actions: the one the mouse came onto
 * (it shrinks back when the mouse leaves it), or the one clicked or tapped
 * (it stays until you act, click elsewhere or press Esc).
 */
export function useGraphPill(views: AgentView[]) {
  const [pill, setPill] = useState<{ id: number; pinned: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mouse = useMouse();
  const lastInside = useRef(0);
  const quiet = useRef({ id: -1, until: 0 });
  const found = views.find((v) => v.id === pill?.id);
  const pillRef = useRef(pill);
  pillRef.current = pill;
  // Answered (or gone): forget it, so its next request starts small.
  const acts = pillActs(found);
  useEffect(() => {
    if (pill && !acts) setPill(null);
  }, [pill, acts]);

  const onPill = (id: number, how: 'hover' | 'click') => {
    const now = performance.now();
    if (how === 'hover' && quiet.current.id === id && now < quiet.current.until) return;
    lastInside.current = now;
    setPill((prev) =>
      how === 'click' ? { id, pinned: true } : prev?.id === id ? prev : { id, pinned: false },
    );
  };

  /** Each frame: over the pill, and shrink it once the mouse has left. */
  const place = (controls: GraphControls, root: HTMLElement | null) => {
    const el = boxRef.current;
    const open = pillRef.current;
    if (!el || !open || !root) return;
    const box = controls.pillOf(open.id);
    if (!box) return;
    placeOver(el, box, root);
    if (open.pinned) return;
    const now = performance.now();
    if (mouseOn(el, mouse.at.current)) lastInside.current = now;
    else if (now - lastInside.current > PILL_GRACE_MS) setPill(null);
  };

  return {
    /** The agent whose pill is grown (only while it still asks something). */
    view: acts ? found : undefined,
    boxRef,
    onPill,
    place,
    close: () => setPill(null),
    /** Closed by acting on it (Aprobar, Rechazar, Hecho). */
    done: () => {
      quiet.current = { id: pillRef.current?.id ?? -1, until: performance.now() + PILL_QUIET_MS };
      setPill(null);
    },
    isOpen: () => pillRef.current !== null,
    trackMouse: mouse.track,
    forgetMouse: mouse.forget,
  };
}
