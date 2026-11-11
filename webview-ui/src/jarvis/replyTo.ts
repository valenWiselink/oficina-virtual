import { useSyncExternalStore } from 'react';

/**
 * «Responder» on a pending ask: Jarvis's box opens with that ask quoted, and
 * what you write goes with its id, who asked it and what it asks (asked
 * 2026-11-11: «Escribirle a Jarvis… sólo abre el chat vacío»). The office
 * reads the id and marks the ask answered; Jarvis knows what it is about.
 */

export interface ReplyTarget {
  id: string;
  from: string;
  text: string;
}

const QUOTE_MAX = 140;

let target: ReplyTarget | undefined;
const listeners = new Set<() => void>();

function set(next: ReplyTarget | undefined): void {
  target = next;
  for (const l of listeners) l();
}

/** Quote this ask in Jarvis's box (the next message answers it). */
export function replyTo(ask: ReplyTarget): void {
  set({ id: ask.id, from: ask.from, text: ask.text });
}

export function clearReply(): void {
  set(undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReplyTarget(): ReplyTarget | undefined {
  return useSyncExternalStore(subscribe, () => target);
}

const clip = (text: string): string =>
  text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1)}…` : text;

/** What goes to Jarvis: the id first (the office reads it), then the words, then what it was about. */
export function replyText(reply: ReplyTarget, said: string): string {
  const about =
    reply.from === 'Jarvis'
      ? `Sobre tu pedido «${clip(reply.text)}»`
      : `Sobre lo que pidió «${reply.from}»: «${clip(reply.text)}»`;
  return `[${reply.id}] ${said.trim()}\n(${about})`;
}
