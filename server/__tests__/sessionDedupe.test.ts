import { describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { duplicateSessionAgents } from '../src/sessionDedupe.js';
import type { AgentState } from '../src/types.js';

const agent = (id: number, sessionId: string, over: Partial<AgentState> = {}) =>
  ({ id, sessionId, ...over }) as AgentState;

describe('duplicateSessionAgents', () => {
  it('keeps one agent per session: the office terminal over an external watch', () => {
    const store = new AgentStateStore();
    store.set(1, agent(1, 's1', { isExternal: true }));
    store.set(2, agent(2, 's1', { isExternal: false }));
    store.set(3, agent(3, 's2'));
    expect(duplicateSessionAgents(store)).toEqual([1]);
  });

  it('between two external watches keeps the oldest; ignores sub-agents', () => {
    const store = new AgentStateStore();
    store.set(4, agent(4, 's1', { isExternal: true }));
    store.set(7, agent(7, 's1', { isExternal: true }));
    store.set(9, agent(9, 's1', { leadAgentId: 4 }));
    expect(duplicateSessionAgents(store)).toEqual([7]);
  });
});
