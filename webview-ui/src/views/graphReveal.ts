/**
 * "You opened this agent somewhere else" — Alt+N, Alt+1…9, Ctrl+K, the
 * history or a terminal tab — so the graph, when it is on screen, selects it
 * and brings it into view. A tiny event bus: the graph may not be mounted
 * (the board is showing), and then nobody listens.
 */
type Listener = (agentId: number) => void;

const listeners = new Set<Listener>();

export function revealOnGraph(agentId: number): void {
  for (const listener of listeners) listener(agentId);
}

export function onRevealOnGraph(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
