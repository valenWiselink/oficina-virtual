import { useRef, useState } from 'react';

import { useNow } from '../hooks/useNow.js';
import type { AgentView } from './agentViews.js';
import { cardSpot, hoverFacts, type HoverTarget } from './graphHover.js';
import type { GraphControls } from './useGraphCanvas.js';

/** The quick card of the agent (or member) the mouse rests on: what it says,
 *  and keeping it beside its node every frame (it moves). */
export function useGraphHover(views: AgentView[]) {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const cardRef = useRef<HTMLDivElement>(null);
  const now = useNow();

  const place = (controls: GraphControls, root: HTMLElement | null) => {
    const card = cardRef.current;
    const target = hoverRef.current;
    if (!card || !target || !root) return;
    const node = controls.screenOf(target.id, target.member);
    if (!node) return;
    const spot = cardSpot(
      node,
      { w: card.offsetWidth, h: card.offsetHeight },
      { w: root.clientWidth, h: root.clientHeight },
    );
    card.style.transform = `translate(${Math.round(spot.left)}px, ${Math.round(spot.top)}px)`;
    card.style.visibility = 'visible';
  };

  return {
    facts: hover ? hoverFacts(views, hover, now) : null,
    cardRef,
    setHover,
    place,
  };
}
