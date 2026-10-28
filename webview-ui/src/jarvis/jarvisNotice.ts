import { useSyncExternalStore } from 'react';

import { transport } from '../transport/index.js';

/**
 * What the office says once when ElevenLabs cannot (no key, no credit) and
 * Jarvis speaks with Fish instead: shown by its bubble until you close it. The office does not repeat it until ElevenLabs works again.
 */

let notice: string | undefined;
const listeners = new Set<() => void>();

function set(next: string | undefined): void {
  notice = next;
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  if ((msg.type === 'jarvisVoice' || msg.type === 'jarvisVoiceFailed') && msg.notice)
    set(msg.notice);
});

export function dismissJarvisNotice(): void {
  set(undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJarvisNotice(): string | undefined {
  return useSyncExternalStore(subscribe, () => notice);
}
