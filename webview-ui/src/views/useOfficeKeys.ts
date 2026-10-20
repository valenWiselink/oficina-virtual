import { useEffect, useRef } from 'react';

import type { AgentView } from './agentViews.js';
import { officeKeyTarget } from './officeKeys.js';

/**
 * Alt+N: open whoever has waited longest for you. Alt+1…9: open each agent
 * (in board order). Caught before the terminal sees the key, and only these
 * combinations — everything else still reaches Claude Code.
 */
export function useOfficeKeys(
  views: AgentView[],
  open: (agentId: number) => void,
  /** Everyone, every workspace (Alt+N); defaults to `views`. */
  all: AgentView[] = views,
): void {
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const allRef = useRef(all);
  allRef.current = all;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = officeKeyTarget(ev, viewsRef.current, allRef.current);
      if (target === null) return;
      ev.preventDefault();
      ev.stopPropagation();
      openRef.current(target);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);
}
