import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingAsksList } from '../../core/src/messages.js';
import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { PRIVILEGED_ONLY_BROADCASTS } from '../src/httpServer.js';
import { commandOf, PendingAsks } from '../src/pendingAsks/pendingAsks.js';
import { PendingAsksWatch } from '../src/pendingAsks/pendingAsksWatch.js';
import type { AgentState } from '../src/types.js';

const NOW = 1_800_000_000_000;

let dir: string;
let file: string;
let sent: PendingAsksList[];
let clock: number;

const list = () => new PendingAsks({ broadcast: (m) => sent.push(m), file, now: () => clock });
const openTexts = (asks: PendingAsks) => asks.open().map((a) => a.text);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-pending-'));
  file = path.join(dir, 'pendientes.json');
  sent = [];
  clock = NOW;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the command an ask brings', () => {
  it('is the first code span with an argument', () => {
    expect(commandOf('correr `gh pr merge 12` y avisarme')).toBe('gh pr merge 12');
    expect(commandOf('abrir `informe.md` y correr `npm run migrate`')).toBe('npm run migrate');
  });

  it.each(['mergear a `main`', 'mirar `reports/brag.mp4`', 'sin código', ''])(
    'none in «%s»',
    (t) => {
      expect(commandOf(t)).toBeUndefined();
    },
  );

  it('nothing to look at, nothing found', () => {
    expect(commandOf(undefined)).toBeUndefined();
  });
});

describe('the list', () => {
  it('keeps who asks, what and since when, what waited longest first', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'decidir el nombre', at: NOW });
    asks.add({ from: 'Coral', text: 'probar el login', at: NOW - 5000 });
    expect(asks.message().open).toEqual([
      { id: 'p2', from: 'Coral', text: 'probar el login', at: NOW - 5000 },
      { id: 'p1', from: 'Jarvis', text: 'decidir el nombre', at: NOW },
    ]);
  });

  it('tells the page each change', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno' });
    expect(sent.at(-1)?.open).toHaveLength(1);
    asks.closeById('p1', 'Lo marcaste hecho');
    expect(sent.at(-1)?.open).toEqual([]);
    expect(sent.at(-1)?.closed[0]).toMatchObject({ id: 'p1', closedHow: 'Lo marcaste hecho' });
  });

  it('a closed one tells the page which answers it ends, an open one does not', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno', turnId: 't1' });
    expect(asks.message().open[0].turnIds).toBeUndefined();
    asks.closeById('p1', 'Lo cerró Jarvis');
    expect(asks.message().closed[0].turnIds).toEqual(['t1']);
  });

  it('survives a restart, with what was closed and its numbering', () => {
    const first = list();
    first.add({ from: 'Jarvis', text: 'uno', turnId: 't1' });
    first.add({ from: 'Jarvis', text: 'dos', command: 'npm run x', turnId: 't2' });
    first.closeById('p1', 'Lo marcaste hecho');

    const second = list();
    expect(second.message().open).toEqual([
      expect.objectContaining({ id: 'p2', text: 'dos', command: 'npm run x' }),
    ]);
    expect(second.message().closed[0].id).toBe('p1');
    expect(second.hasSeen('t1')).toBe(true);
    expect(second.add({ from: 'Jarvis', text: 'tres' })?.id).toBe('p3');
  });

  it('a damaged file starts empty rather than breaking the office', () => {
    fs.writeFileSync(file, '{ no es json');
    expect(list().message()).toEqual({ type: 'pendingAsks', open: [], closed: [] });
  });

  it('a very long text is cut, an empty one is nothing', () => {
    const asks = list();
    expect(asks.add({ from: 'Jarvis', text: 'x'.repeat(900) })?.text).toHaveLength(240);
    expect(asks.add({ from: 'Jarvis', text: '   ' })).toBeUndefined();
  });

  it('finds an id however it is said', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno' });
    expect(asks.find('P1')?.id).toBe('p1');
    expect(asks.find(' 1 ')?.id).toBe('p1');
    expect(asks.find('p9')).toBeUndefined();
  });

  it('closing an unknown or already closed one changes nothing', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno' });
    asks.closeById('p1', 'primero');
    expect(asks.closeById('p1', 'segundo')).toBeUndefined();
    expect(asks.closeById('p9', 'nada')).toBeUndefined();
    expect(asks.find('p1')?.closedHow).toBe('primero');
  });

  it('can be reopened, and it waits since when it did', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno', at: NOW });
    asks.closeById('p1', 'Lo marcaste hecho');
    asks.reopen('p1');
    expect(asks.message().open).toEqual([{ id: 'p1', from: 'Jarvis', text: 'uno', at: NOW }]);
  });

  it('does not grow for ever, and never loses what is open', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'sigue abierto' });
    for (let i = 0; i < 130; i++) {
      clock += 1;
      const ask = asks.add({ from: 'Jarvis', text: `pedido ${i}` });
      asks.closeById(ask!.id, 'Lo marcaste hecho');
    }
    expect(openTexts(asks)).toEqual(['sigue abierto']);
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as { asks: unknown[] };
    expect(saved.asks.length).toBeLessThanOrEqual(101);
    expect(asks.message().closed.length).toBeLessThanOrEqual(30);
  });
});

describe('an ask you reopened', () => {
  const reopened = () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno', turnId: 't1' });
    asks.markTurnsDone(['t1']);
    asks.reopen('p1');
    return asks;
  };

  it('stays open when a page reminds the office what its browser marked', () => {
    const asks = reopened();
    asks.markTurnsDone(['t1'], true);
    expect(openTexts(asks)).toEqual(['uno']);
  });

  it('and after a restart too', () => {
    reopened();
    const after = list();
    after.markTurnsDone(['t1'], true);
    expect(openTexts(after)).toEqual(['uno']);
  });

  it('«Hecho» on purpose closes it again', () => {
    const asks = reopened();
    asks.markTurnsDone(['t1']);
    expect(openTexts(asks)).toEqual([]);
  });

  it('a reminder still closes what was never reopened', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno', turnId: 't1' });
    asks.markTurnsDone(['t1'], true);
    expect(openTexts(asks)).toEqual([]);
  });
});

describe('when a new ask takes the place of an old one', () => {
  const add = (asks: PendingAsks, text: string, from = 'Jarvis') => asks.add({ from, text });

  it('the same words do not make a second row', () => {
    const asks = list();
    add(asks, 'Mergear el PR y avisarme');
    const again = asks.add({ from: 'Jarvis', text: ' mergear  el pr y avisarme ', turnId: 't9' });
    expect(openTexts(asks)).toHaveLength(1);
    expect(again?.id).toBe('p1');
    // Marking the repeated answer done closes the one row.
    asks.markTurnsDone(['t9']);
    expect(openTexts(asks)).toEqual([]);
  });

  it('a newer one about the same PR replaces it, and says so', () => {
    const asks = list();
    add(asks, 'probar el PR #99 en un iPhone');
    add(asks, 'decidir si el PR #99 va después del #98');
    expect(openTexts(asks)).toEqual(['decidir si el PR #99 va después del #98']);
    expect(asks.find('p1')?.closedHow).toBe('Lo reemplazó p2');
  });

  it('whoever asks it: an agent and Jarvis talking of one PR are one thing to do', () => {
    const asks = list();
    add(asks, 'mergear #23', 'Coral');
    add(asks, 'mergear el PR #23, señor', 'Jarvis');
    expect(openTexts(asks)).toEqual(['mergear el PR #23, señor']);
  });

  it('asks about different things pile up: that is the point', () => {
    const asks = list();
    add(asks, 'decidir la voz del video');
    add(asks, 'mergear el PR #23');
    add(asks, 'mergear el PR #24');
    expect(openTexts(asks)).toHaveLength(3);
  });

  it('the same number in two repos is not the same PR', () => {
    const asks = list();
    const url = (repo: string) => `revisar https://github.com/acme/${repo}/pull/12`;
    add(asks, url('web'));
    add(asks, url('api'));
    expect(openTexts(asks)).toHaveLength(2);
  });

  it('a replaced one can come back if the guess was wrong', () => {
    const asks = list();
    add(asks, 'cerrar #5');
    add(asks, 'mergear #5');
    asks.reopen('p1');
    expect(openTexts(asks)).toEqual(['cerrar #5', 'mergear #5']);
  });
});

describe('what closes an ask by itself', () => {
  it('«Hecho» on a card or the visor', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'uno', turnId: 't1' });
    asks.markTurnsDone(['t1', 't-otro']);
    expect(asks.find('p1')?.closedHow).toBe('Lo marcaste hecho');
    // Marked before it was ever seen: it never shows up.
    expect(asks.hasSeen('t-otro')).toBe(true);
  });

  it('its PR merging, and nothing else', () => {
    const url = 'https://github.com/acme/web/pull/7';
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear #7', prUrl: url });
    asks.add({ from: 'Jarvis', text: 'decidir el nombre' });
    asks.closeByPr(url, 'Se mergeó el PR');
    expect(asks.find('p1')?.closedHow).toBe('Se mergeó el PR');
    expect(openTexts(asks)).toEqual(['decidir el nombre']);
  });
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

const turn = (id: string, text: string, extra = {}) => ({ id, text, at: NOW, ...extra });
const JARVIS = { supervision: { kind: 'all' } } as Partial<AgentState>;

describe('what feeds the list', () => {
  const setup = () => {
    const store = new AgentStateStore();
    const asks = list();
    const watch = new PendingAsksWatch(store, asks);
    watch.start();
    const identity = (id: number) => store.broadcast({ type: 'agentIdentity', id });
    return { store, asks, watch, identity };
  };

  it('every «Te toca:» of Jarvis, one after another, with its command', () => {
    const { store, asks, identity } = setup();
    const jarvis = agentOf(store, 1, {
      ...JARVIS,
      lastReply: 'Listo.\nTe toca: correr `npm run migrate` y avisarme',
      yourTurn: turn('t1', 'correr npm run migrate y avisarme'),
    } as Partial<AgentState>);
    identity(1);
    jarvis.lastReply = 'Te toca: decidir el nombre';
    jarvis.yourTurn = turn('t2', 'decidir el nombre') as AgentState['yourTurn'];
    identity(1);
    expect(asks.message().open).toEqual([
      expect.objectContaining({
        from: 'Jarvis',
        text: 'correr npm run migrate y avisarme',
        command: 'npm run migrate',
      }),
      expect.objectContaining({ from: 'Jarvis', text: 'decidir el nombre' }),
    ]);
  });

  it('the same answer seen again, or after a restart, is not news', () => {
    const { store, asks, identity } = setup();
    agentOf(store, 1, {
      ...JARVIS,
      lastReply: 'Te toca: decidir',
      yourTurn: turn('t1', 'decidir'),
    } as Partial<AgentState>);
    identity(1);
    identity(1);
    asks.closeById('p1', 'Lo marcaste hecho');
    identity(1);
    expect(asks.open()).toEqual([]);

    const again = list();
    const store2 = new AgentStateStore();
    const watch2 = new PendingAsksWatch(store2, again);
    agentOf(store2, 1, {
      ...JARVIS,
      lastReply: 'Te toca: decidir',
      yourTurn: turn('t1', 'decidir'),
    } as Partial<AgentState>);
    watch2.start();
    expect(again.open()).toEqual([]);
  });

  it('whatever brings Jarvis to the middle stays: the PR it handed over too', () => {
    const { store, asks, identity } = setup();
    agentOf(store, 1, {
      ...JARVIS,
      lastReply: 'Se abrió https://github.com/acme/web/pull/3',
      yourTurn: turn('t1', 'revisar el PR #3 (web)'),
    } as Partial<AgentState>);
    identity(1);
    expect(openTexts(asks)).toEqual(['revisar el PR #3 (web)']);
  });

  it('an ask of Jarvis about a PR already merged is no news', () => {
    const { store, asks, identity } = setup();
    agentOf(store, 1, {
      ...JARVIS,
      lastReply: 'Te toca: mergear #3',
      yourTurn: turn('t1', 'mergear #3', { merged: { number: 3, url: 'u', told: false } }),
    } as Partial<AgentState>);
    identity(1);
    expect(asks.open()).toEqual([]);
  });

  it('an agent on the board stays out: its card already says it', () => {
    const { store, asks, identity } = setup();
    agentOf(store, 2, {
      lastReply: 'Te toca: probar',
      yourTurn: turn('t2', 'probar'),
    } as Partial<AgentState>);
    identity(2);
    expect(asks.open()).toEqual([]);
  });

  it('closing an agent with an ask left keeps it, under its name', () => {
    const { store, asks, watch } = setup();
    const agent = agentOf(store, 2, {
      nickname: 'Coral',
      lastReply: 'Te toca: correr `gh pr merge 12` cuando puedas',
      yourTurn: turn('t2', 'correr gh pr merge 12 cuando puedas'),
    } as Partial<AgentState>);
    watch.agentClosed(agent);
    expect(asks.message().open).toEqual([
      expect.objectContaining({
        from: 'Coral',
        text: 'correr gh pr merge 12 cuando puedas',
        command: 'gh pr merge 12',
      }),
    ]);
  });

  it('nothing left behind, nothing added: no ask, merged, or marked done', () => {
    const { store, asks, watch } = setup();
    watch.agentClosed(agentOf(store, 2));
    watch.agentClosed(
      agentOf(store, 3, {
        yourTurn: turn('t3', 'mergear #3', { merged: { number: 3, url: 'u', told: false } }),
      } as Partial<AgentState>),
    );
    asks.markTurnsDone(['t4']);
    watch.agentClosed(agentOf(store, 4, { yourTurn: turn('t4', 'probar') } as Partial<AgentState>));
    expect(asks.open()).toEqual([]);
  });

  it('closed by its supervisor it stays out: the supervisor was told, and only that time', () => {
    const { store, asks, watch } = setup();
    const agent = agentOf(store, 2, {
      yourTurn: turn('t2', 'pasarle el link a Valentín'),
    } as Partial<AgentState>);
    watch.supervisorCloses(agent.sessionId);
    watch.agentClosed(agent);
    expect(asks.open()).toEqual([]);
    watch.agentClosed(agent);
    expect(openTexts(asks)).toEqual(['pasarle el link a Valentín']);
  });

  it('the office going down is not each agent closing', () => {
    const { store, asks, watch } = setup();
    const agent = agentOf(store, 2, { yourTurn: turn('t2', 'probar') } as Partial<AgentState>);
    watch.stop();
    watch.agentClosed(agent);
    expect(asks.open()).toEqual([]);
  });

  it('a sub-agent of a team has no ask of its own for you', () => {
    const { store, asks, watch } = setup();
    watch.agentClosed(
      agentOf(store, 5, { leadAgentId: 1, yourTurn: turn('t5', 'probar') } as Partial<AgentState>),
    );
    expect(asks.open()).toEqual([]);
  });

  it('its PR merging closes it', () => {
    const url = 'https://github.com/acme/web/pull/7';
    const { store, asks, identity } = setup();
    agentOf(store, 1, {
      ...JARVIS,
      lastReply: 'Te toca: mergear #7',
      yourTurn: turn('t1', 'mergear #7', { prAsk: { url, number: 7, notify: false } }),
    } as Partial<AgentState>);
    identity(1);
    store.broadcast({
      type: 'prStatus',
      url: 'https://github.com/acme/web/pull/8',
      state: 'merged',
    });
    expect(asks.open()).toHaveLength(1);
    store.broadcast({ type: 'prStatus', url, state: 'open' });
    expect(asks.open()).toHaveLength(1);
    store.broadcast({ type: 'prStatus', url, state: 'merged' });
    expect(asks.open()).toEqual([]);
    expect(asks.find('p1')?.closedHow).toBe('Se mergeó el PR');
  });

  it('the permission it asks about being decided closes it', () => {
    const { store, asks, identity } = setup();
    const jarvis = agentOf(store, 1, {
      ...JARVIS,
      asksValentin: 'req-1',
      lastReply: 'Te toca: Coral quiere borrar la rama, ¿le digo que sí?',
      yourTurn: turn('t1', 'Coral quiere borrar la rama, ¿le digo que sí?'),
    } as Partial<AgentState>);
    identity(1);
    expect(asks.open()).toHaveLength(1);
    identity(1);
    expect(asks.open()).toHaveLength(1);
    jarvis.asksValentin = undefined;
    identity(1);
    expect(asks.open()).toEqual([]);
    expect(asks.find('p1')?.closedHow).toBe('Se decidió el permiso');
  });
});

describe('who gets the list', () => {
  it('never a read-only client', () => {
    expect(PRIVILEGED_ONLY_BROADCASTS.has('pendingAsks')).toBe(true);
  });

  it('logs nothing of what is asked', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'pedido secreto' });
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
