import { useSyncExternalStore } from 'react';

import type { TeTocaRuleStatus } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/**
 * Where the "Te toca" rule sits in your global CLAUDE.md (server
 * teTocaRule.ts): the office's agents get it anyway; this is about also
 * having it in the sessions you open outside the office. Null until the
 * server says (a read-only office never does).
 */
let current: TeTocaRuleStatus | null = null;
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  if (msg.type !== 'teTocaRuleStatus') return;
  current = msg;
  for (const l of listeners) l();
});

export function useTeTocaRule(): TeTocaRuleStatus | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Add it to (or take it back from) your global CLAUDE.md. */
export function setTeTocaRuleGlobal(enabled: boolean): void {
  transport.send({ type: 'setTeTocaRuleGlobal', enabled });
}
