import type { AgentStateStore } from './agentStateStore.js';

/**
 * One Claude Code session is one agent in the office. If two main agents end
 * up following the same session (two discovery paths — a restored external
 * agent and a hook adoption — that saw the transcript path spelled
 * differently), the office would show it twice and split its activity
 * between them. Keep one: the office's own terminal over an external watch,
 * else the oldest; return the ids to remove.
 */
export function duplicateSessionAgents(store: AgentStateStore): number[] {
  const bySession = new Map<string, number[]>();
  for (const [id, agent] of store) {
    if (agent.leadAgentId !== undefined || !agent.sessionId) continue; // subs, teammates
    const ids = bySession.get(agent.sessionId) ?? [];
    ids.push(id);
    bySession.set(agent.sessionId, ids);
  }
  const doomed: number[] = [];
  for (const ids of bySession.values()) {
    if (ids.length < 2) continue;
    const keep = [...ids].sort((a, b) => {
      const ea = store.get(a)?.isExternal ? 1 : 0;
      const eb = store.get(b)?.isExternal ? 1 : 0;
      return ea !== eb ? ea - eb : a - b;
    })[0];
    doomed.push(...ids.filter((id) => id !== keep));
  }
  return doomed;
}
