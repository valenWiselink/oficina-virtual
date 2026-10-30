import { useEffect, useState, useSyncExternalStore } from 'react';

import type { ChatItem } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { type PendingDelivery, shownPending } from './chatText.js';

/** Each agent's conversation as chat lines: loaded when its chat opens,
 *  then appended as the session writes. */
const chats = new Map<number, ChatItem[]>();
const listeners = new Set<() => void>();

/** A message sent from the chat that the transcript has not shown yet:
 *  drawn right away ("Enviando…"), dropped when its record arrives. Claude
 *  Code writes a message only when it reads it — a busy agent queues it until
 *  its turn ends (measured 2026-10-20), so it can take a while. */
export interface PendingMessage {
  key: string;
  text: string;
  /** Previews (object URLs) of the images sent with it. */
  images?: string[];
  /** Where the office saved them (to send them again on a retry). */
  paths?: string[];
  at: number;
  /** Whether it reached the agent's terminal (sendToAgent). */
  delivery: PendingDelivery;
}

const pending = new Map<number, PendingMessage[]>();
let pendingSeq = 0;

function emit(): void {
  for (const l of listeners) l();
}

/** Draw a message you just sent until the transcript brings it; the key
 *  settles its delivery later. */
export function addPending(
  agentId: number,
  text: string,
  pictures?: { previews: string[]; paths: string[] },
): string {
  const entry: PendingMessage = {
    key: `p${++pendingSeq}`,
    text,
    ...(pictures?.paths.length ? { images: pictures.previews, paths: pictures.paths } : {}),
    at: Date.now(),
    delivery: 'sending',
  };
  pending.set(agentId, [...(pending.get(agentId) ?? []), entry]);
  emit();
  return entry.key;
}

/** It reached the agent's terminal, or it never will. */
export function settleDelivery(agentId: number, key: string, sent: boolean): void {
  const waiting = pending.get(agentId);
  if (!waiting?.some((p) => p.key === key)) return;
  const delivery: PendingDelivery = sent ? 'sent' : 'failed';
  pending.set(
    agentId,
    waiting.map((p) => (p.key === key ? { ...p, delivery } : p)),
  );
  emit();
}

/** Forget one (a failed message you retry or discard). */
export function dropPending(agentId: number, key: string): void {
  const left = (pending.get(agentId) ?? []).filter((p) => p.key !== key);
  if (left.length > 0) pending.set(agentId, left);
  else pending.delete(agentId);
  emit();
}

/** The previews of images sent from this page, by the chat line that shows
 *  them once the transcript has it (the transcript only counts them). */
const sentPictures = new Map<string, string[]>();

export function picturesOf(itemId: string): string[] | undefined {
  return sentPictures.get(itemId);
}

/** Drop the pending messages the transcript already shows; their previews
 *  move to the line that shows them. */
function settlePending(agentId: number, items: readonly ChatItem[]): void {
  const waiting = pending.get(agentId);
  if (!waiting) return;
  const shown = shownPending(
    waiting,
    items.filter((i) => i.role === 'user'),
  );
  const left = waiting.filter((p) => {
    const line = shown.get(p.key);
    if (line && p.images) sentPictures.set(line.id, p.images);
    return !line;
  });
  if (left.length === waiting.length) return;
  if (left.length > 0) pending.set(agentId, left);
  else pending.delete(agentId);
}

transport.onMessage((msg) => {
  if (msg.type === 'agentChat') {
    const id = msg.id as number;
    const items = (msg.items as ChatItem[]) ?? [];
    chats.set(id, items);
    settlePending(id, items);
    emit();
  } else if (msg.type === 'agentChatAppend') {
    const id = msg.id as number;
    const appended = msg.items as ChatItem[];
    settlePending(id, appended);
    const current = chats.get(id);
    if (!current) return emit(); // not open: it loads whole when it opens
    const seen = new Set(current.map((i) => i.id));
    const fresh = appended.filter((i) => !seen.has(i.id));
    if (fresh.length > 0) chats.set(id, [...current, ...fresh]);
    emit();
  }
});

const NO_PENDING: PendingMessage[] = [];

/** The messages you sent from the chat that it has not shown yet. */
export function usePendingMessages(agentId: number): PendingMessage[] {
  return useSyncExternalStore(subscribe, () => pending.get(agentId) ?? NO_PENDING);
}

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
