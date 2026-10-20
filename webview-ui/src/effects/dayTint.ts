import { useEffect, useState } from 'react';

import { useCalmMode } from './calmMode.js';
import { dayTintVar } from './dayPhase.js';

/** How often the background re-checks the hour. */
const CHECK_MS = 5 * 60_000;

/** The CSS variable for the backdrop right now (fixed in calm mode). */
export function useDayTint(): string {
  const calm = useCalmMode();
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return calm ? '--color-bg-dark' : dayTintVar(hour);
}
