import { useSyncExternalStore } from 'react';

import type { TerminalInputHandle } from '../components/TerminalPane.js';

/**
 * Every mounted terminal pane, by agent: how anything in the office (quick
 * replies on a card, a message to several agents, "Compactar") writes to an
 * agent as if typed in its terminal. Only agents whose terminal lives in
 * this office are here (one running outside has no pane).
 */
const handles = new Map<number, TerminalInputHandle>();
let ids: ReadonlySet<number> = new Set();
const listeners = new Set<() => void>();

function changed(): void {
  ids = new Set(handles.keys());
  for (const l of listeners) l();
}

export function registerAgentInput(agentId: number, handle: TerminalInputHandle | null): void {
  if (handle) handles.set(agentId, handle);
  else handles.delete(agentId);
  changed();
}

/** Delay between the pasted text and Enter, so the TUI takes the paste first. */
const ENTER_AFTER_MS = 40;

/**
 * Send a message to an agent: a bracketed paste (newlines stay inside the
 * message), then Enter. False when the agent has no terminal here.
 */
export function sendToAgent(agentId: number, text: string): boolean {
  const input = handles.get(agentId);
  if (!input) return false;
  input.paste(text);
  setTimeout(() => input.send('\r'), ENTER_AFTER_MS);
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The agents you can write to from here, re-rendering when it changes. */
export function useWritableAgents(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, () => ids);
}
