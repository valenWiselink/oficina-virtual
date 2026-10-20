import { useEffect, useState } from 'react';

/** Milliseconds since the scene mounted, ticking often enough for typing. */
export function useSceneClock(stepMs = 60): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - start), stepMs);
    return () => clearInterval(timer);
  }, [stepMs]);
  return elapsed;
}
