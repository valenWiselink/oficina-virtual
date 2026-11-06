import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { PendingAsks } from '../src/pendingAsks/pendingAsks.js';
import { CloseWatch, QUIET_MS, yourTurnSettled } from '../src/supervisors/closeWatch.js';
import type { AgentState } from '../src/types.js';

const NOW = 1_800_000_000_000;

let dir: string;
let clock: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-close-'));
  clock = NOW;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** An office agent that finished its turn, delivered, and went quiet at `quietSince`. */
function finished(store: AgentStateStore, id: number, over: Partial<AgentState> = {}): AgentState {
  const agent = createAgentState({
    id,
    sessionId: `session-${id}`,
    projectDir: 'C:/x',
    jsonlFile: `C:/x/${id}.jsonl`,
    isExternal: false,
  });
  Object.assign(agent, {
    officeTerminal: true,
    isWaiting: true,
    nickname: `agente${id}`,
    lastReply: 'Listo: abrí el PR y pasaron los tests.',
    lastRecordAt: NOW - QUIET_MS,
    ...over,
  });
  store.set(id, agent);
  return agent;
}

function setup(permissions = 0) {
  const store = new AgentStateStore();
  const asks = new PendingAsks({
    broadcast: () => undefined,
    file: path.join(dir, 'pendientes.json'),
  });
  const told: string[] = [];
  const sent: Array<Record<string, unknown>> = [];
  store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
  const watch = new CloseWatch({
    store,
    asks: () => asks,
    permissionsOf: () => permissions,
    tell: (id, line) => told.push(line(store.get(id)?.nickname ?? '?')),
    now: () => clock,
  });
  return { store, asks, told, sent, watch };
}

describe('an agent nobody needs any more', () => {
  it('is marked «para cerrar» and its supervisors hear it once', () => {
    const { store, told, sent, watch } = setup();
    finished(store, 1, { nickname: 'icono' });
    watch.tick();
    expect(store.get(1)?.closeSuggestedAt).toBe(NOW);
    expect(sent.at(-1)).toMatchObject({ type: 'agentIdentity', id: 1, closeSuggestedAt: NOW });
    expect(told).toEqual([expect.stringContaining('«icono» terminó, entregó y lleva 15 minutos')]);
    expect(told[0]).toContain('cerrar_agente');
    watch.tick();
    watch.tick();
    expect(told).toHaveLength(1);
  });

  it('not before it has been quiet a while', () => {
    const { store, told, watch } = setup();
    finished(store, 1, { lastRecordAt: NOW - QUIET_MS + 60_000 });
    watch.tick();
    expect(store.get(1)?.closeSuggestedAt).toBeUndefined();
    clock += 60_000;
    watch.tick();
    expect(store.get(1)?.closeSuggestedAt).toBe(clock);
    expect(told).toHaveLength(1);
  });

  it('back to work, the mark goes; quiet again, it is told again', () => {
    const { store, told, sent, watch } = setup();
    const agent = finished(store, 1);
    watch.tick();
    agent.isWaiting = false;
    agent.lastRecordAt = clock;
    watch.tick();
    expect(agent.closeSuggestedAt).toBeUndefined();
    expect(sent.at(-1)).toMatchObject({
      type: 'agentIdentity',
      id: 1,
      closeSuggestedAt: undefined,
    });
    agent.isWaiting = true;
    clock += QUIET_MS;
    watch.tick();
    expect(told).toHaveLength(2);
  });

  it.each<[string, Partial<AgentState>]>([
    ['working', { isWaiting: false }],
    ['a tool still running', { activeToolIds: new Set(['t']) }],
    ['a permission in its terminal', { permissionSent: true }],
    ['background work', { backgroundAgentToolIds: new Set(['bg']) }],
    ['never did anything', { lastReply: undefined }],
    ['a supervisor', { supervision: { kind: 'all' } } as Partial<AgentState>],
    ['a teammate', { leadAgentId: 9 }],
    ['outside the office', { officeTerminal: false }],
    ['asking a question in its answer', { lastReply: 'Ya está. ¿Querés que siga con el back?' }],
    ['leaving a «Te toca» nobody handled', { yourTurn: { id: 't1', text: 'mergear el PR #12' } }],
  ])('stays when %s', (_why, over) => {
    const { store, told, watch } = setup();
    finished(store, 1, over);
    watch.tick();
    expect(store.get(1)?.closeSuggestedAt).toBeUndefined();
    expect(told).toEqual([]);
  });

  it('stays while a permission card waits on it', () => {
    const { store, told, watch } = setup(1);
    finished(store, 1);
    watch.tick();
    expect(told).toEqual([]);
  });
});

describe('a «Te toca» that needs nothing more', () => {
  const agentWith = (yourTurn: AgentState['yourTurn']) => ({ yourTurn }) as AgentState;

  it('none, or its PR merged', () => {
    expect(yourTurnSettled(agentWith(undefined), undefined)).toBe(true);
    expect(
      yourTurnSettled(
        agentWith({ id: 't', text: 'x', merged: { number: 1, url: 'u', told: true } }),
        undefined,
      ),
    ).toBe(true);
  });

  it('marked «Hecho», or its ask in Pendientes closed (by Jarvis or by hand)', () => {
    const { asks } = setup();
    asks.markTurnsDone(['t1']);
    expect(yourTurnSettled(agentWith({ id: 't1', text: 'probar' }), asks)).toBe(true);
    asks.add({ from: 'demo', text: 'relanzar el build', turnId: 't2' });
    expect(yourTurnSettled(agentWith({ id: 't2', text: 'relanzar el build' }), asks)).toBe(false);
    asks.closeById('p1', 'Lo cerró Jarvis: el build se destrabó');
    expect(yourTurnSettled(agentWith({ id: 't2', text: 'relanzar el build' }), asks)).toBe(true);
  });

  it('a closed agent «Lo atiende Jarvis» whose ask Jarvis closed is one to close', () => {
    const { store, asks, told, watch } = setup();
    asks.add({ from: 'demo', text: 'relanzar el build', turnId: 't2' });
    asks.closeById('p1', 'Lo cerró Jarvis: el build se destrabó');
    finished(store, 1, { nickname: 'demo', yourTurn: { id: 't2', text: 'relanzar el build' } });
    watch.tick();
    expect(told).toEqual([expect.stringContaining('«demo»')]);
  });
});
