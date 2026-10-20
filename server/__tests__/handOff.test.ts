import { describe, expect, it } from 'vitest';

import { observeIdentity } from '../src/agentIdentity.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { HAND_OFF_MAX_CHARS, handOff, handOffText } from '../src/terminal/handOff.js';
import type { PtySessionManager } from '../src/terminal/ptySessionManager.js';
import type { AgentState } from '../src/types.js';

function setup(withTerminal = true) {
  const store = new AgentStateStore();
  store.set(1, { nickname: 'CTO' } as AgentState);
  store.set(2, {} as AgentState);
  const written: string[] = [];
  const ptyManager = {
    get: (id: number) =>
      withTerminal && id === 2 ? { write: (d: string) => written.push(d) } : undefined,
  } as unknown as PtySessionManager;
  return { store, ptyManager, written };
}

const assistant = (text: string, isSidechain = false) => ({
  type: 'assistant',
  isSidechain,
  message: { content: [{ type: 'text', text }] },
});

describe('last reply', () => {
  it('keeps the main conversation answer, not a subagent sidechain', () => {
    const agent = {} as AgentState;
    observeIdentity(agent, assistant('Plan: usar el fork.'));
    observeIdentity(agent, assistant('cosas del subagente', true));
    expect(agent.lastReply).toBe('Plan: usar el fork.');
  });
});

describe('handOff', () => {
  it("pastes the answer into the target's terminal, bracketed and unsent", () => {
    const { store, ptyManager, written } = setup();
    store.get(1)!.lastReply = 'Hecho: 3 bugs arreglados.';
    expect(handOff(store, ptyManager, 1, 2)).toEqual({ ok: true });
    expect(written).toHaveLength(1);
    expect(written[0].startsWith('\x1b[200~')).toBe(true);
    expect(written[0].endsWith('\x1b[201~')).toBe(true);
    expect(written[0]).toContain('«CTO»');
    expect(written[0]).not.toMatch(/\r$/);
  });

  it('refuses a target without an office terminal, or a source with nothing to say', () => {
    const noTerminal = setup(false);
    noTerminal.store.get(1)!.lastReply = 'x';
    expect(handOff(noTerminal.store, noTerminal.ptyManager, 1, 2).ok).toBe(false);
    const silent = setup();
    expect(handOff(silent.store, silent.ptyManager, 1, 2)).toEqual({
      ok: false,
      reason: 'Ese agente todavía no respondió nada',
    });
    expect(silent.written).toEqual([]);
  });

  it('strips escape bytes and caps the length', () => {
    const text = handOffText('A', `malo\x1b[201~ruido${'x'.repeat(HAND_OFF_MAX_CHARS)}`);
    expect(text).not.toContain('\x1b');
    expect(text).toContain('[… recortado');
  });
});
