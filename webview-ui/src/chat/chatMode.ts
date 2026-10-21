import { useCallback, useEffect, useState } from 'react';

/** What a terminal slot shows: the conversation as a chat, or the raw terminal. */
export type PaneMode = 'chat' | 'terminal';

const KEY = 'oficina.vistaTerminal';
const SHOW_TERMINAL_EVENT = 'oficina:mostrar-terminal';
const SHOW_CHAT_EVENT = 'oficina:mostrar-chat';

/** Show this agent's raw terminal rather than its chat — where a prompt the
 *  office cannot answer (a permission it no longer holds) is answered. A
 *  one-off: the remembered default stays as it was. */
export function showTerminalOf(agentId: number): void {
  window.dispatchEvent(new CustomEvent<number>(SHOW_TERMINAL_EVENT, { detail: agentId }));
}

/** Show this agent's chat (the graph's menu, «Ver chat»). Also a one-off. */
export function showChatOf(agentId: number): void {
  window.dispatchEvent(new CustomEvent<number>(SHOW_CHAT_EVENT, { detail: agentId }));
}

function recallDefault(): PaneMode {
  try {
    return localStorage.getItem(KEY) === 'terminal' ? 'terminal' : 'chat';
  } catch {
    return 'chat';
  }
}

/**
 * Chat or terminal, per agent; a new agent opens the way you last chose
 * (remembered in this browser) — except one that has not written anything
 * yet (`fresh`): it opens on the terminal, where a first-time Claude Code
 * asks for the theme and the login and the chat has nothing to show.
 */
export function usePaneModes(): [
  (agentId: number, fresh?: boolean) => PaneMode,
  (agentId: number, mode: PaneMode) => void,
] {
  const [byAgent, setByAgent] = useState<Record<number, PaneMode>>({});
  const [fallback, setFallback] = useState<PaneMode>(recallDefault);
  useEffect(() => {
    const show = (mode: PaneMode) => (e: Event) => {
      const agentId = (e as CustomEvent<number>).detail;
      setByAgent((prev) => (prev[agentId] === mode ? prev : { ...prev, [agentId]: mode }));
    };
    const onTerminal = show('terminal');
    const onChat = show('chat');
    window.addEventListener(SHOW_TERMINAL_EVENT, onTerminal);
    window.addEventListener(SHOW_CHAT_EVENT, onChat);
    return () => {
      window.removeEventListener(SHOW_TERMINAL_EVENT, onTerminal);
      window.removeEventListener(SHOW_CHAT_EVENT, onChat);
    };
  }, []);
  const modeOf = useCallback(
    (agentId: number, fresh = false) => byAgent[agentId] ?? (fresh ? 'terminal' : fallback),
    [byAgent, fallback],
  );
  const setMode = useCallback((agentId: number, mode: PaneMode) => {
    setByAgent((prev) => ({ ...prev, [agentId]: mode }));
    setFallback(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* blocked storage: it lasts this tab */
    }
  }, []);
  return [modeOf, setMode];
}
