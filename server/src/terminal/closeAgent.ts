import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { stopBackground } from './backgroundSessions.js';
import type { PtySessionManager } from './ptySessionManager.js';

/**
 * Close an agent, the office's ✕ (and Jarvis's `cerrar_agente`). Two shapes: a
 * PTY-backed agent we launched (kill the process -- the counterpart of VS
 * Code's terminalRef.dispose()), or an external agent we merely observed
 * (dismiss the file so the scanner doesn't re-adopt it, then remove).
 * removeAgent fires agentRemoved, which httpServer maps to an agentClosed
 * broadcast. Returns false when there is no such agent.
 */
export function closeOfficeAgent(
  deps: { store: AgentStateStore; runtime?: AgentRuntime; ptyManager?: PtySessionManager },
  id: number,
): boolean {
  const { store, runtime } = deps;
  const agent = store.get(id);
  if (!agent || !runtime) return false;
  if (agent.bgId) {
    // A background session would outlive its terminal: closing the agent
    // stops it and takes it off Claude Code's list (the transcript stays).
    agent.bgLeaving = true;
    runtime.resumableSessions?.remove(agent.sessionId);
    void stopBackground(agent.bgId, agent.cwd);
  }
  // dispose() is a no-op for agents with no terminal, so this is safe for
  // both shapes. The PTY's onExit handler does the store cleanup for
  // PTY-backed agents; do it here too so external agents (and a PTY that
  // never exits) are still removed promptly.
  deps.ptyManager?.dispose(id);
  runtime.closeAgent(id);
  return true;
}
