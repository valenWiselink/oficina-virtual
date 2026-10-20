import { useSyncExternalStore } from 'react';

import { CHAT_FONT_SIZE_PX } from '../constants.js';

/** One font size for the chat view (the terminal keeps its own), remembered
 *  in this browser. */
const KEY = 'oficina.chatLetra';
export const CHAT_FONT_MIN_PX = 12;
export const CHAT_FONT_MAX_PX = 20;

let size = recall();
const listeners = new Set<() => void>();

/** `current` changed by `step` px (0 = back to the default), clamped. */
export function nextChatFont(current: number, step: number): number {
  if (step === 0) return CHAT_FONT_SIZE_PX;
  return Math.min(CHAT_FONT_MAX_PX, Math.max(CHAT_FONT_MIN_PX, current + step));
}

function recall(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= CHAT_FONT_MIN_PX && n <= CHAT_FONT_MAX_PX
      ? n
      : CHAT_FONT_SIZE_PX;
  } catch {
    return CHAT_FONT_SIZE_PX;
  }
}

export function zoomChatFont(step: number): void {
  const next = nextChatFont(size, step);
  if (next === size) return;
  size = next;
  try {
    localStorage.setItem(KEY, String(size));
  } catch {
    /* blocked storage: it lasts this tab */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chat's font size, re-rendering when it changes. */
export function useChatFontSize(): number {
  return useSyncExternalStore(subscribe, () => size);
}
