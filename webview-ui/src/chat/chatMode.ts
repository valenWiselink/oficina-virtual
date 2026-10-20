import { useCallback, useState } from 'react';

/** What a terminal slot shows: the conversation as a chat, or the raw terminal. */
export type PaneMode = 'chat' | 'terminal';

const KEY = 'oficina.vistaTerminal';

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
