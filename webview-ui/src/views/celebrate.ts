import { useEffect, useState } from 'react';

import { TRAVEL_MS } from './cardTravel.js';

/** How long a card shows its celebration (hop and sparks), counting the
 *  moment it travels to "Terminó" before it starts. */
export const CHEER_MS = TRAVEL_MS + 1600;

/** "Hecho" pressed for an agent: the graph (if on screen) celebrates it, and
 *  so does its board card — which moves column right then and remounts, so
 *  when it started is kept here rather than in the card. */
const listeners = new Set<(agentId: number) => void>();
const startedAt = new Map<number, number>();

export function requestCelebration(agentId: number): void {
  startedAt.set(agentId, Date.now());
  for (const l of listeners) l(agentId);
}

export function onCelebration(listener: (agentId: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function remaining(agentId: number): number {
  const since = startedAt.get(agentId);
  return since === undefined ? 0 : CHEER_MS - (Date.now() - since);
}

/** Whether this agent's card is celebrating right now. */
export function useCheer(agentId: number): boolean {
  const [cheering, setCheering] = useState(() => remaining(agentId) > 0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      const left = remaining(agentId);
      setCheering(left > 0);
      if (left > 0) timer = setTimeout(() => setCheering(false), left);
    };
    const timerAtMount = setTimeout(settle, 0);
    const off = onCelebration((id) => {
      if (id === agentId) settle();
    });
    return () => {
      off();
      clearTimeout(timer);
      clearTimeout(timerAtMount);
    };
  }, [agentId]);
  return cheering;
}
