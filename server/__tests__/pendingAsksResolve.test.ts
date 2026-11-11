import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingAsksList } from '../../core/src/messages.js';
import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { setPrStates } from '../src/mergedAsk.js';
import { PendingAsks, prUrlsOf } from '../src/pendingAsks/pendingAsks.js';
import { PendingAsksWatch, QUESTION_GRACE_MS } from '../src/pendingAsks/pendingAsksWatch.js';
import type { AgentState } from '../src/types.js';

const NOW = 1_800_000_000_000;
const PR = (n: number) => `https://github.com/acme/web/pull/${n}`;
const NAVEGADOR =
  'Ya lo saqué de la lista.\n\n¿Ya puedo dejar que los agentes vuelvan a usar el navegador? Lo necesitan para las pruebas de esta noche.';

let dir: string;
let clock: number;
let sent: PendingAsksList[];
let prStates: Map<string, string>;

const list = () =>
  new PendingAsks({
    broadcast: (m) => sent.push(m),
    file: path.join(dir, 'pendientes.json'),
    now: () => clock,
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-resolve-'));
  clock = NOW;
  sent = [];
  prStates = new Map();
  setPrStates((url) => prStates.get(url) as never);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  setPrStates(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

function agentOf(store: AgentStateStore, id: number, over: Partial<AgentState> = {}): AgentState {
  const agent = createAgentState({
    id,
    sessionId: `session-${id}`,
    projectDir: 'C:/x',
    jsonlFile: `C:/x/${id}.jsonl`,
    isExternal: false,
  });
  Object.assign(agent, over);
  store.set(id, agent);
  return agent;
}

const JARVIS = { supervision: { kind: 'all' }, isWaiting: true } as Partial<AgentState>;

function setup() {
  const store = new AgentStateStore();
  const asks = list();
  const watch = new PendingAsksWatch(store, asks, () => clock);
  watch.start();
  const identity = (id: number) => store.broadcast({ type: 'agentIdentity', id });
  return { store, asks, watch, identity };
}

/** Jarvis just ended a turn with `reply`. */
function jarvisSays(store: AgentStateStore, reply: string, id = 'r1'): AgentState {
  return agentOf(store, 1, {
    ...JARVIS,
    lastReply: reply,
    lastReplyId: id,
    lastReplyAt: clock,
  } as Partial<AgentState>);
}

describe('a question Jarvis left without «Te toca:»', () => {
  it('goes to Pendientes once he has not answered for a while', () => {
    const { store, asks, watch } = setup();
    jarvisSays(store, NAVEGADOR);
    watch.tick();
    expect(asks.open()).toEqual([]);
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.message().open).toEqual([
      expect.objectContaining({
        from: 'Jarvis',
        text: '¿Ya puedo dejar que los agentes vuelvan a usar el navegador? Lo necesitan para las pruebas de esta noche.',
        at: NOW,
      }),
    ]);
    watch.tick();
    expect(asks.open()).toHaveLength(1);
  });

  it('answered in time, it never shows', () => {
    const { store, asks, watch } = setup();
    const jarvis = jarvisSays(store, NAVEGADOR);
    clock += 30_000;
    jarvis.valentinPromptAt = clock;
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()).toEqual([]);
  });

  it('his next words to Jarvis close it', () => {
    const { store, asks, watch, identity } = setup();
    const jarvis = jarvisSays(store, NAVEGADOR);
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()).toHaveLength(1);
    jarvis.valentinPromptAt = clock + 1000;
    identity(1);
    expect(asks.open()).toEqual([]);
    expect(asks.find('p1')?.closedHow).toBe('Le contestaste a Jarvis');
  });

  it('his words close only questions: a «Te toca:» waits for it to be done', () => {
    const { store, asks, identity } = setup();
    const jarvis = agentOf(store, 1, {
      ...JARVIS,
      lastReply: 'Te toca: agregar los registros en Namecheap y avisarme',
      yourTurn: { text: 'agregar los registros en Namecheap y avisarme', id: 't1', at: NOW },
    } as Partial<AgentState>);
    identity(1);
    jarvis.valentinPromptAt = NOW + 60_000;
    identity(1);
    expect(asks.open()).toHaveLength(1);
  });

  it('a question in the middle of its work is not one for him', () => {
    const { store, asks, watch } = setup();
    jarvisSays(store, NAVEGADOR).isWaiting = false;
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()).toEqual([]);
  });

  it('if Jarvis left an ask in that same turn, the question is most likely it', () => {
    const { store, asks, watch } = setup();
    asks.add({
      from: 'Jarvis',
      text: 'avisarme cuando los agentes puedan usar el navegador',
      at: NOW - 60_000,
    });
    jarvisSays(store, NAVEGADOR);
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()).toHaveLength(1);
  });

  it('marked «Hecho», it does not come back; a restart does not bring it twice', () => {
    const { store, asks, watch } = setup();
    jarvisSays(store, NAVEGADOR);
    clock += QUESTION_GRACE_MS;
    watch.tick();
    asks.closeById('p1', 'Lo marcaste hecho');
    watch.tick();
    expect(asks.open()).toEqual([]);

    const again = list();
    const store2 = new AgentStateStore();
    jarvisSays(store2, NAVEGADOR);
    new PendingAsksWatch(store2, again, () => clock).sync();
    expect(again.open()).toEqual([]);
  });

  it('another agent asking a question is on its card, not here', () => {
    const { store, asks, watch } = setup();
    agentOf(store, 2, {
      isWaiting: true,
      lastReply: NAVEGADOR,
      lastReplyId: 'r2',
      lastReplyAt: NOW,
    } as Partial<AgentState>);
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()).toEqual([]);
  });

  it('is kept as a question, so Jarvis sees the office noted it (jarvis.test.ts)', () => {
    const { store, asks, watch } = setup();
    jarvisSays(store, NAVEGADOR);
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()[0].question).toBe(true);
  });

  it('a busy Jarvis (a tool still running) has not ended its turn', () => {
    const { store, asks, watch } = setup();
    jarvisSays(store, NAVEGADOR).activeToolIds.add('tool-1');
    clock += QUESTION_GRACE_MS;
    watch.tick();
    expect(asks.open()).toEqual([]);
  });
});

describe('what looks done', () => {
  it('all the PRs an ask names merged: it looks done, and waits for a last look', () => {
    const { store, asks, watch } = setup();
    const agent = agentOf(store, 2, {
      nickname: 'buscador',
      lastReply: `Abrí ${PR(12)}.\n\nTe toca: mergear el PR #12 y avisarle a la organizadora`,
      yourTurn: { text: 'mergear el PR #12 y avisarle a la organizadora', id: 't2', at: NOW },
      prLinks: new Map([[12, PR(12)]]),
    } as Partial<AgentState>);
    watch.agentClosed(agent);
    expect(asks.prUrls()).toEqual([PR(12)]);
    prStates.set(PR(12), 'open');
    store.broadcast({ type: 'prStatus', url: PR(12), state: 'open' });
    expect(asks.open()[0].seemsDone).toBeUndefined();
    prStates.set(PR(12), 'merged');
    store.broadcast({ type: 'prStatus', url: PR(12), state: 'merged' });
    expect(asks.message().open).toEqual([
      expect.objectContaining({ id: 'p1', seemsDone: 'Se mergeó el PR #12' }),
    ]);
  });

  it('one of two PRs merged is not enough', () => {
    const asks = list();
    asks.add({
      from: 'Jarvis',
      text: `mergear ${PR(1)} y ${PR(2)}`,
      prUrls: prUrlsOf(`${PR(1)} ${PR(2)}`),
    });
    prStates.set(PR(1), 'merged');
    asks.settlePrs((u) => prStates.get(u));
    expect(asks.open()[0].seemsDone).toBeUndefined();
    prStates.set(PR(2), 'merged');
    asks.settlePrs((u) => prStates.get(u));
    // Merging both was all it asked: done, not just looking done.
    expect(asks.open()).toEqual([]);
    expect(asks.find('p1')?.closedHow).toBe('Se mergearon los PRs #1, #2');
  });

  it('closed without merging is not done', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'revisar', prUrls: [PR(3)] });
    prStates.set(PR(3), 'closed');
    asks.settlePrs((u) => prStates.get(u));
    expect(asks.open()[0].seemsDone).toBeUndefined();
  });

  it('an agent that only waited for an answer is gone: nobody waits any more', () => {
    const { store, asks, watch } = setup();
    watch.agentClosed(
      agentOf(store, 2, {
        nickname: 'icono',
        lastReply: 'Te toca: avisarme cuando pueda volver a usar Chrome',
        yourTurn: { text: 'avisarme cuando pueda volver a usar Chrome', id: 't2', at: NOW },
      } as Partial<AgentState>),
    );
    expect(asks.open()[0].seemsDone).toBe('«icono» ya se cerró: nadie espera la respuesta');
  });

  it('what it left to do stays as it was', () => {
    const { store, asks, watch } = setup();
    watch.agentClosed(
      agentOf(store, 2, {
        nickname: 'pase',
        yourTurn: { text: 'confirmar en TestFlight que el build 99 está listo', id: 't2', at: NOW },
      } as Partial<AgentState>),
    );
    expect(asks.open()[0].seemsDone).toBeUndefined();
  });

  it('goes below what still waits, and out of the count; «Sigue pendiente» brings it back', () => {
    const asks = list();
    asks.add({
      from: 'Jarvis',
      text: 'viejo y resuelto',
      at: NOW - 5000,
      seemsDone: 'Se mergeó el PR #1',
    });
    asks.add({ from: 'Jarvis', text: 'nuevo', at: NOW });
    expect(asks.open().map((a) => a.text)).toEqual(['nuevo', 'viejo y resuelto']);
    asks.keep('p1');
    expect(asks.open().map((a) => a.text)).toEqual(['viejo y resuelto', 'nuevo']);
    expect(asks.message().open[0].seemsDone).toBeUndefined();
  });
});

describe('the PRs an ask names', () => {
  it('its links, and a «#12» the agent linked before', () => {
    const known = new Map([[12, PR(12)]]);
    expect(prUrlsOf(`mergear #12 y ${PR(40)}`, known)).toEqual([PR(40), PR(12)]);
    expect(prUrlsOf('mergear #99', known)).toEqual([]);
    expect(prUrlsOf('mergear el PR treinta')).toEqual([]);
  });
});
