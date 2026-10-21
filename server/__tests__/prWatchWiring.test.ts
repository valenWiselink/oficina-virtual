import { afterEach, describe, expect, it } from 'vitest';

import type { PrState } from '../../core/src/messages.js';
import { observeIdentity } from '../src/agentIdentity.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { setPrStates } from '../src/mergedAsk.js';
import type { GhAnswer } from '../src/prWatch.js';
import { watchAgentPrs } from '../src/prWatchWiring.js';
import type { AgentState } from '../src/types.js';

/** Let the watch's first look (started on creation) finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const URL = 'https://github.com/Wiselink/wiselink_frontend_webapp/pull/77';

/** An idle agent whose last answer asked to merge the PR and be told. */
function agentAsking(text: string): AgentState {
  const agent = { isWaiting: true, activeToolIds: new Set() } as unknown as AgentState;
  observeIdentity(agent, {
    type: 'assistant',
    uuid: 'r1',
    timestamp: '2026-10-20T17:13:00.000Z',
    message: { content: [{ type: 'text', text }] },
  });
  return agent;
}

function setUp(text: string) {
  const store = new AgentStateStore();
  store.set(1, agentAsking(text));
  const sent: Array<Record<string, unknown>> = [];
  store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
  const written: string[] = [];
  let state: PrState = 'open';
  const watch = watchAgentPrs(
    store,
    { prUrls: () => [], prMerged: () => {} },
    {
      terminalOf: () => ({ write: (d: string) => void written.push(d) }),
      run: async (): Promise<GhAnswer> => ({ ok: true, state }),
    },
  );
  return {
    store,
    sent,
    written,
    watch,
    merge: () => {
      state = 'merged';
    },
  };
}

describe('watchAgentPrs: a merge settles the "te toca" that asked for it', () => {
  afterEach(() => setPrStates(() => undefined));

  it('tells the idle agent, then lets the offices know (identity before prStatus)', async () => {
    const t = setUp(`PR listo: ${URL}\n\nTe toca: mergear el PR #77 y avisarme`);
    await settle();
    expect(t.written).toEqual([]);
    t.merge();
    await t.watch.tick();
    t.watch.stop();
    expect(t.written[0]).toContain('Ya mergeé el PR #77.');
    const types = t.sent.map((m) => m.type);
    expect(types.indexOf('agentIdentity')).toBeLessThan(types.lastIndexOf('prStatus'));
    const identity = t.sent.find((m) => m.type === 'agentIdentity');
    expect(identity?.yourTurnMerged).toEqual({ number: 77, url: URL, told: true });
  });

  it('leaves alone a "te toca" that only mentions the PR', async () => {
    const t = setUp(`${URL}\n\nTe toca: cargar el secret en el repo (está en el PR #77)`);
    await settle();
    t.merge();
    await t.watch.tick();
    t.watch.stop();
    expect(t.written).toEqual([]);
    expect(t.store.get(1)!.yourTurn!.merged).toBeUndefined();
  });
});
