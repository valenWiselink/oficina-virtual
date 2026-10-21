import { useEffect, useRef, useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';
import { updatesBridge, type UpdateState } from './desktopUpdates.js';
import { nextQuietSince, quietLongEnough } from './installWhenIdle.js';

/** How often the armed install looks again (a hidden window may tick less). */
const LOOK_EVERY_MS = 5_000;

function useConnected(): boolean {
  return useSyncExternalStore(
    (l) => transport.onStateChange(l),
    () => transport.state === 'connected',
  );
}

/**
 * "Cuando nadie esté trabajando", armed: installs once the office has been
 * quiet for QUIET_BEFORE_INSTALL_MS. A disconnected office counts as busy —
 * with no news from the server, "nobody working" would be a guess.
 */
export function useInstallWhenIdle(update: UpdateState | null, busy: number): void {
  const connected = useConnected();
  const quietSince = useRef<number | null>(null);
  const installing = useRef(false);
  const armed = update?.whenIdle === true && update.status === 'ready';
  useEffect(() => {
    if (!armed) {
      quietSince.current = null;
      return;
    }
    const look = () => {
      const now = Date.now();
      quietSince.current = nextQuietSince(quietSince.current, busy > 0 || !connected, now);
      if (!installing.current && quietLongEnough(quietSince.current, now)) {
        installing.current = true;
        updatesBridge()?.install();
      }
    };
    look();
    const timer = setInterval(look, LOOK_EVERY_MS);
    return () => clearInterval(timer);
  }, [armed, busy, connected]);
}
