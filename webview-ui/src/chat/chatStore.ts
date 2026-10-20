import { useEffect, useState, useSyncExternalStore } from 'react';

import type { ChatItem } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/** Each agent's conversation as chat lines: loaded when its chat opens,
 *  then appended as the session writes. */
const chats = new Map<number, ChatItem[]>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

transport.onMessage((msg) => {
  if (msg.type === 'agentChat') {
    chats.set(msg.id as number, (msg.items as ChatItem[]) ?? []);
    emit();
  } else if (msg.type === 'agentChatAppend') {
    const id = msg.id as number;
    const current = chats.get(id);
    if (!current) return; // not open: it loads whole when it opens
    const seen = new Set(current.map((i) => i.id));
    const fresh = (msg.items as ChatItem[]).filter((i) => !seen.has(i.id));
    if (fresh.length === 0) return;
    chats.set(id, [...current, ...fresh]);
    emit();
  }
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How long to wait for the conversation before saying it did not come. */
const LOAD_TIMEOUT_MS = 6000;

/**
 * An agent's chat; asks the server for it when first shown. `items` is null
 * while that answer is on its way; `failed` says it never came (an office
 * server older than this page answers nothing), and `retry` asks again.
 */
export function useAgentChat(agentId: number): {
  items: ChatItem[] | null;
  failed: boolean;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const items = useSyncExternalStore(subscribe, () => chats.get(agentId) ?? null) ?? null;
  const loaded = items !== null;
  useEffect(() => {
    transport.send({ type: 'requestAgentChat', id: agentId });
    if (loaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [agentId, attempt, loaded]);
  return {
    items,
    failed: timedOut && !loaded,
    retry: () => {
      setTimedOut(false);
      setAttempt((n) => n + 1);
    },
  };
}
