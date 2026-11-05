import { useSyncExternalStore } from 'react';

import type { ArtifactsList } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { readArtifactsMessage } from './artifactsView.js';

/**
 * The artifacts as the office last sent them. Null until the first message: an
 * office that never sends one (read-only, older server) has no panel.
 */
let current: ArtifactsList | null = null;
const listeners = new Set<() => void>();

transport.onMessage((msg) => {
  const next = readArtifactsMessage(msg as unknown as Record<string, unknown>);
  if (!next) return;
  current = next;
  for (const listener of listeners) listener();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useArtifacts(): ArtifactsList | null {
  return useSyncExternalStore(subscribe, () => current);
}
