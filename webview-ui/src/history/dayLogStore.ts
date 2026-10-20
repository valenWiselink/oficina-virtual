import { useSyncExternalStore } from 'react';

import type { DayLogEntry } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/** Today's history as the server keeps it: the whole day on connect, then
 *  one line at a time. */
let entries: DayLogEntry[] = [];
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  if (msg.type === 'dayLog') {
    entries = (msg.entries as DayLogEntry[]) ?? [];
  } else if (msg.type === 'dayLogAppended') {
    entries = [...entries, msg.entry as DayLogEntry];
  } else {
    return;
  }
  for (const l of listeners) l();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDayLog(): DayLogEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}
