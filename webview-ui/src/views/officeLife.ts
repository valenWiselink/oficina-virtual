import { useEffect } from 'react';

import type { AgentView } from './agentViews.js';
import { onCelebration } from './celebrate.js';
import { ClawdLife } from './clawdLife.js';

/**
 * The Clawds' little life, one for the whole office: going to the board and
 * back no longer starts it over (the coffee counts real time, a celebration
 * waiting for "Te necesita" to empty is not lost, nobody arrives twice).
 */
export const officeLife = new ClawdLife();

// "Hecho" pressed anywhere: the graph celebrates it when it is on screen.
onCelebration((id) => officeLife.celebrate(id));

/** Keep it up to date with every agent, whichever view is showing. */
export function useOfficeLife(views: AgentView[]): void {
  useEffect(() => {
    officeLife.observe(views, Date.now());
  }, [views]);
}

const WAVE_KEY = 'oficina.saludoDelGrafo';

/** Today, as the browser's clock says it (YYYY-MM-DD). */
export function dayKey(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Whether today's big wave is still due, marking it given. With storage
 *  blocked it waves every time, as it used to. */
export function takeDailyWave(
  today: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
): boolean {
  try {
    if (!storage || storage.getItem(WAVE_KEY) === today) return !storage;
    storage.setItem(WAVE_KEY, today);
    return true;
  } catch {
    return true;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
