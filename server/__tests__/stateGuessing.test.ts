import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { PERMISSION_TIMER_DELAY_MS } from '../src/constants.js';
import {
  setStateGuessingAllowed,
  startPermissionTimer,
  startWaitingTimer,
} from '../src/timerManager.js';
import type { AgentState } from '../src/types.js';

function storeWithBusyAgent(): { store: AgentStateStore; sent: Record<string, unknown>[] } {
  const store = new AgentStateStore();
  const agent = {
    activeToolIds: new Set(['t1']),
    activeToolNames: new Map([['t1', 'Bash']]),
    activeSubagentToolNames: new Map(),
  } as unknown as AgentState;
  store.set(1, agent);
  const sent: Record<string, unknown>[] = [];
  store.on('broadcast', (m) => sent.push(m));
  return { store, sent };
}

describe('state guessing switch', () => {
  afterEach(() => {
    setStateGuessingAllowed(true);
    vi.useRealTimers();
  });

  it('guesses permission and idle from silence while allowed (no hooks)', () => {
    vi.useFakeTimers();
    const { store, sent } = storeWithBusyAgent();
    startPermissionTimer(1, store, new Map(), new Set());
    startWaitingTimer(1, 10, store, new Map());
    vi.advanceTimersByTime(PERMISSION_TIMER_DELAY_MS + 1);
    expect(sent.map((m) => m.type)).toEqual(['agentStatus', 'agentToolPermission']);
  });

  it('never guesses once hooks are the source of truth', () => {
    vi.useFakeTimers();
    setStateGuessingAllowed(false);
    const { store, sent } = storeWithBusyAgent();
    const permissionTimers = new Map();
    startPermissionTimer(1, store, permissionTimers, new Set());
    startWaitingTimer(1, 10, store, new Map());
    vi.advanceTimersByTime(PERMISSION_TIMER_DELAY_MS + 1);
    expect(sent).toEqual([]);
    expect(permissionTimers.size).toBe(0);
  });
});
