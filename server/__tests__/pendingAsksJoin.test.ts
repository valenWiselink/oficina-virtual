/* eslint-disable pixel-agents/no-inline-colors -- PR numbers like «#2954» read as hex colours */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingAsksList } from '../../core/src/messages.js';
import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  ANSWER_SETTLE_MS,
  HOLD_MS,
  PendingAsks,
  STALE_MS,
} from '../src/pendingAsks/pendingAsks.js';
import { PendingAsksWatch } from '../src/pendingAsks/pendingAsksWatch.js';
import { askRefs, numbersToDigits, onlyMerge } from '../src/pendingAsks/refs.js';
import type { AgentState } from '../src/types.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const WEBAPP = 'https://github.com/Wiselink/wiselink_frontend_webapp/pull/2956';

let dir: string;
let file: string;
let sent: PendingAsksList[];
let told: string[];
let clock: number;

const list = () =>
  new PendingAsks({
    broadcast: (m) => sent.push(m),
    tellJarvis: (t) => told.push(t),
    file,
    now: () => clock,
  });
const openTexts = (asks: PendingAsks) => asks.open().map((a) => a.text);
const entry = (asks: PendingAsks, id: string) => asks.message().open.find((a) => a.id === id);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-join-'));
  file = path.join(dir, 'pendientes.json');
  sent = [];
  told = [];
  clock = NOW;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('numbers written for the voice', () => {
  it.each([
    ['mergear el PR dos mil novecientos cincuenta y cuatro', 'mergear el PR 2954'],
    [
      'mergear los PRs ciento cuarenta y nueve y ochocientos noventa y seis, y avisarme',
      'mergear los PRs 149 y 896, y avisarme',
    ],
    ['cerrar el dos mil novecientos cincuenta y tres', 'cerrar el 2953'],
    ['el back ochocientos noventa', 'el back 890'],
  ])('«%s» → «%s»', (said, written) => {
    expect(numbersToDigits(said)).toBe(written);
  });

  it.each([
    'decidir las dos decisiones de la una',
    'recomiendo al cien por ciento',
    'en veinte minutos',
  ])('small or lone numbers stay words: «%s»', (said) => {
    expect(numbersToDigits(said)).toBe(said);
  });
});

describe('what an ask is about', () => {
  it('a PR by its command, its link, its number or its words', () => {
    expect(
      askRefs('mergear #2956', 'gh pr merge 2956 --repo Wiselink/wiselink_frontend_webapp --merge'),
    ).toEqual(['pr:wiselink_frontend_webapp#2956']);
    expect(askRefs(`revisar ${WEBAPP}`)).toEqual(['pr:wiselink_frontend_webapp#2956']);
    expect(askRefs('mergear los PRs 149 y 896')).toEqual(['pr:?#149', 'pr:?#896']);
  });

  it('a migration, a ticket, an artifact', () => {
    expect(askRefs('correr en producción la migración de índices M2')).toEqual(['migracion:M2']);
    expect(askRefs('cerrar WISE-6517 en Jira')).toEqual(['ticket:WISE-6517']);
    expect(askRefs('elegir en https://claude.ai/artifact/RRY7UnivpVntFXGwPMifEk')).toEqual([
      'artifact:RRY7UnivpVntFXGwPMifEk',
    ]);
  });
});

describe('merging is all it asks', () => {
  it.each([
    'mergear webapp #2954 a main y cerrar #2953 y avisarme',
    'Mergear webapp #2956 a main: saca «Eventos» junto al logo (#2955); después «login» verifica en prod',
    'revisar y mergear el PR #2761 si te cierra',
  ])('«%s»', (text) => {
    expect(onlyMerge(text)).toBe(true);
  });

  it.each(['mergear #12 y publicar la app en la tienda', 'decidir si mergeamos #12'])(
    'not «%s»',
    (text) => {
      expect(onlyMerge(text)).toBe(false);
    },
  );
});

describe('the same thing asked again is one ask', () => {
  it('p225: Jarvis leaves the merge with its command, then says it in «Te toca:» — the button stays', () => {
    const asks = list();
    asks.add({
      from: 'Jarvis',
      text: 'Mergear webapp #2956 a main: saca «Eventos» junto al logo',
      command: 'gh pr merge 2956 --repo Wiselink/wiselink_frontend_webapp --merge',
    });
    clock += 4000;
    asks.add({
      from: 'Jarvis',
      text: 'mergear el PR #2956 de la webapp con el botón de Pendientes y avisarme',
      turnId: 't226',
    });
    expect(asks.open()).toHaveLength(1);
    const shown = entry(asks, 'p1');
    expect(shown?.text).toBe(
      'mergear el PR #2956 de la webapp con el botón de Pendientes y avisarme',
    );
    expect(shown?.mergeUrl).toBe(WEBAPP);
    expect(shown?.command).toContain('gh pr merge 2956');
  });

  it('a PR in words gets its «Mergear» from the link an agent posted', () => {
    const asks = list();
    asks.add({
      from: 'Jarvis',
      text: 'mergear el PR dos mil novecientos cincuenta y seis y avisarme',
      knownPrs: new Map([[2956, WEBAPP]]),
    });
    expect(entry(asks, 'p1')).toMatchObject({
      text: 'mergear el PR 2956 y avisarme',
      mergeUrl: WEBAPP,
    });
  });

  it('the same migration, in other words', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'correr en prod M2 con wiseadmin y avisarme' });
    asks.add({
      from: 'Jarvis',
      text: 'correr en producción la migración de índices M2; pase comprueba el catálogo',
    });
    expect(openTexts(asks)).toEqual([
      'correr en producción la migración de índices M2; pase comprueba el catálogo',
    ]);
  });

  it('the same key, whatever the words', () => {
    const asks = list();
    asks.add({
      from: 'Jarvis',
      text: 'decidir el dominio de las páginas públicas',
      key: 'dominio-eventos',
    });
    asks.add({
      from: 'Jarvis',
      text: '¿eventos.wiselink.app o www?',
      key: 'dominio-eventos',
      options: ['eventos', 'www'],
    });
    expect(asks.open()).toHaveLength(1);
    expect(entry(asks, 'p1')).toMatchObject({
      text: '¿eventos.wiselink.app o www?',
      options: ['eventos', 'www'],
    });
  });

  it('an agent repeating what Jarvis said keeps Jarvis’s words', () => {
    const asks = list();
    asks.add({
      from: 'Jarvis',
      text: 'Revisar y mergear a develop el PR #2764 (transferir responsabilidades)',
    });
    asks.add({ from: 'nudo', text: 'revisar el PR #2764 y decidir si se mergea a develop' });
    expect(asks.open().map((a) => [a.from, a.text])).toEqual([
      ['Jarvis', 'Revisar y mergear a develop el PR #2764 (transferir responsabilidades)'],
    ]);
  });
});

describe('what a closing agent leaves', () => {
  it('waits out of sight for Jarvis, then shows', () => {
    const asks = list();
    asks.add({ from: 'lazo', text: 'pasarle a Valentín los 4 pasos', holdMs: HOLD_MS });
    expect(asks.open()).toEqual([]);
    expect(asks.pending()).toHaveLength(1);
    clock += HOLD_MS;
    asks.tick();
    expect(openTexts(asks)).toEqual(['pasarle a Valentín los 4 pasos']);
  });

  it('Jarvis passing it on (reemplaza) makes one ask, in sight at once', () => {
    const asks = list();
    asks.add({ from: 'lazo', text: 'pasarle a Valentín los 4 pasos', holdMs: HOLD_MS });
    asks.add({
      from: 'Jarvis',
      text: 'Pentatuel: configurar la propiedad «Equipo» (4 pasos)',
      replaces: ['p1'],
    });
    expect(asks.open().map((a) => [a.id, a.from])).toEqual([['p1', 'Jarvis']]);
  });
});

describe('his answer', () => {
  it('names the ask by its id: it leaves «Ahora» and closes by itself in two hours', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'correr la M2 en prod' });
    asks.answeredBy('[p1] listo, ya la corrí', NOW + MIN);
    expect(entry(asks, 'p1')?.seemsDone).toContain('Le contestaste a Jarvis');
    clock = NOW + MIN + ANSWER_SETTLE_MS;
    asks.tick();
    expect(asks.find('p1')?.closedHow).toContain('Le contestaste a Jarvis: «listo, ya la corrí»');
  });

  it('a short «listo» answers the one thing Jarvis just asked', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'una cosa vieja', at: NOW - 3 * 60 * MIN });
    asks.add({ from: 'Jarvis', text: 'correr la M2 en prod', at: NOW });
    asks.answeredBy('listo', NOW + MIN, NOW - MIN);
    expect(asks.find('p2')?.answeredAt).toBe(NOW + MIN);
    expect(asks.find('p1')?.answeredAt).toBeUndefined();
  });

  it('two asked at once: «listo» is not enough, «sí a todo» is', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear #1' });
    asks.add({ from: 'Jarvis', text: 'mergear #2' });
    expect(asks.answeredBy('listo', NOW + MIN, NOW - MIN)).toEqual([]);
    expect(asks.answeredBy('sí a todo', NOW + 2 * MIN, NOW - MIN).map((a) => a.id)).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('a long message is not a short answer', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear #1' });
    expect(
      asks.answeredBy(
        'sí, pero antes quiero que «pase» revise lo que falta en el deploy de la webapp y me pase el detalle de lo que cambió en las tablas',
        NOW + MIN,
        NOW - MIN,
      ),
    ).toEqual([]);
  });

  it('asked again in new words after he answered: pending again', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear #7' });
    asks.answeredBy('[p1] dale', NOW + MIN);
    clock = NOW + 5 * MIN;
    asks.add({ from: 'Jarvis', text: 'mergear #7: sigue abierto, ¿lo hacés?', at: clock });
    expect(entry(asks, 'p1')?.seemsDone).toBeUndefined();
  });

  it('«Sigue pendiente» brings it back', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear #7' });
    asks.answeredBy('[p1] dale', NOW + MIN);
    asks.keep('p1');
    expect(entry(asks, 'p1')?.seemsDone).toBeUndefined();
  });
});

describe('«Hecho» and the clock', () => {
  it('«Hecho» tells Jarvis which one; a page’s reminder does not', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear #7', turnId: 't1' });
    asks.add({ from: 'Jarvis', text: 'mergear #8', turnId: 't2' });
    asks.closeByHand('p1');
    asks.markTurnsDone(['t2'], true);
    expect(told).toEqual([expect.stringContaining('Valentín marcó hecho p1 («mergear #7»)')]);
  });

  it('nobody touched it in a day: «¿Sigue?»', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'confirmar las copias' });
    clock = NOW + STALE_MS;
    asks.tick();
    expect(entry(asks, 'p1')?.seemsDone).toBe('¿Sigue? Nadie lo movió en 24 h');
    asks.keep('p1');
    expect(entry(asks, 'p1')?.seemsDone).toBeUndefined();
  });

  it('its PRs merged: done when merging was all, only looks done when there is more', () => {
    const asks = list();
    const url = (n: number) => `https://github.com/acme/web/pull/${n}`;
    asks.add({ from: 'Jarvis', text: `mergear ${url(1)} y avisarme` });
    asks.add({ from: 'Jarvis', text: `mergear ${url(2)} y publicar la app` });
    asks.settlePrs(() => 'merged');
    expect(asks.find('p1')?.closedHow).toBe('Se mergeó el PR #1');
    expect(entry(asks, 'p2')?.seemsDone).toBe('Se mergeó el PR #2');
  });
});

function agentOf(store: AgentStateStore, id: number, over: Partial<AgentState>): AgentState {
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

describe('the watch', () => {
  const JARVIS = { supervision: { kind: 'all' } } as Partial<AgentState>;

  it('his message to Jarvis with an id answers that ask', () => {
    const store = new AgentStateStore();
    const asks = list();
    const watch = new PendingAsksWatch(store, asks, () => clock);
    watch.start();
    asks.add({ from: 'Jarvis', text: 'correr la M2' });
    const jarvis = agentOf(store, 1, { ...JARVIS, valentinPromptAt: NOW - 10 * MIN });
    store.broadcast({ type: 'agentIdentity', id: 1 });
    jarvis.valentinPromptAt = NOW + MIN;
    jarvis.valentinPromptText = '[p1] listo';
    store.broadcast({ type: 'agentIdentity', id: 1 });
    expect(asks.find('p1')?.answeredAt).toBe(NOW + MIN);
    watch.stop();
  });

  it('a permission belongs to the ask that brought it, not to the next «Te toca:»', () => {
    const store = new AgentStateStore();
    const asks = list();
    const watch = new PendingAsksWatch(store, asks, () => clock);
    watch.start();
    const jarvis = agentOf(store, 1, {
      ...JARVIS,
      asksValentin: 'perm-1',
      lastReply: 'Te toca: aprobar el permiso de app',
      yourTurn: { id: 't1', text: 'aprobar el permiso de app', at: NOW },
    } as Partial<AgentState>);
    store.broadcast({ type: 'agentIdentity', id: 1 });
    jarvis.lastReply = 'Te toca: mergear el PR #2956';
    jarvis.yourTurn = {
      id: 't2',
      text: 'mergear el PR #2956',
      at: NOW + MIN,
    } as AgentState['yourTurn'];
    store.broadcast({ type: 'agentIdentity', id: 1 });
    expect(asks.find('p1')?.permission).toBe('perm-1');
    expect(asks.find('p2')?.permission).toBeUndefined();
    watch.stop();
  });

  it('an agent closing with Jarvis in the office: held for him', () => {
    const store = new AgentStateStore();
    const asks = list();
    const watch = new PendingAsksWatch(store, asks, () => clock);
    watch.start();
    agentOf(store, 1, JARVIS);
    const coral = agentOf(store, 2, {
      nickname: 'coral',
      yourTurn: { id: 't9', text: 'revisar el informe', at: NOW },
    } as Partial<AgentState>);
    watch.agentClosed(coral);
    expect(asks.open()).toEqual([]);
    expect(asks.pending()[0]?.heldUntil).toBe(NOW + HOLD_MS);
    watch.stop();
  });
});
