import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { answerKind } from '../src/pendingAsks/answerKinds.js';
import {
  AskReviewer,
  parseVerdicts,
  REVIEW_BACKOFF_MS,
  REVIEW_EVERY_MS,
  reviewPrompt,
} from '../src/pendingAsks/askReviewer.js';
import { PendingAsks } from '../src/pendingAsks/pendingAsks.js';
import { PendingAsksWatch } from '../src/pendingAsks/pendingAsksWatch.js';
import type { AgentState } from '../src/types.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

let dir: string;
let clock: number;

const list = () =>
  new PendingAsks({
    broadcast: () => {},
    file: path.join(dir, 'pendientes.json'),
    now: () => clock,
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pendientes-solos-'));
  clock = NOW;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('what his answer means', () => {
  it.each([
    ['listo', 'done'],
    ['hecho', 'done'],
    ['ya está', 'done'],
    ['sí, la A', 'done'],
    ['no', 'done'],
    ['ya lo corrí y quedó', 'done'],
    ['hacelo vos', 'hand'],
    ['no sé, como quieras', 'leave'],
    ['todavía no', 'notYet'],
    ['más tarde lo veo', 'notYet'],
    ['no pude entrar', 'notYet'],
    ['me tira error al abrir la bandeja', 'trouble'],
    ['¿cuál comando?', 'trouble'],
    ['no anda', 'trouble'],
    ['me tira error', 'trouble'],
  ])('«%s» → %s', (said, kind) => {
    expect(answerKind(said)).toBe(kind);
  });

  it('«todavía no» keeps it pending, untouched by the clock of answers', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'correr el comando nuevo en PowerShell' });
    asks.answeredBy('todavía no', NOW + MIN, NOW - MIN);
    expect(asks.find('p1')?.closedAt).toBeUndefined();
    expect(asks.find('p1')?.answeredAt).toBeUndefined();
  });
});

describe('its author goes on to the next step', () => {
  it('what he answered with a problem closes when the author speaks again', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'entrar a la bandeja nueva', turnId: 't1' });
    asks.answeredBy('[p1] me tira error', NOW + MIN);
    expect(asks.movedOn('Jarvis', NOW + 2 * MIN, 't2').map((a) => a.id)).toEqual(['p1']);
    expect(asks.find('p1')?.closedHow).toBe('Jarvis siguió después de tu respuesta');
    expect(asks.find('p1')?.closedAuto).toBe(true);
  });

  it('not what he never answered, nor another author’s, nor one asked again in that turn', () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'mergear el PR del panel', turnId: 't1' });
    asks.add({ from: 'pase3', text: 'revisar el informe de pases', turnId: 'a1' });
    asks.add({ from: 'Jarvis', text: 'correr la M2', turnId: 't2' });
    asks.answeredBy('[p2] no encuentro el informe', NOW + MIN);
    asks.answeredBy('[p3] ¿en prod o en dev?', NOW + MIN);
    // Jarvis's next turn asks p3 again with the same words (same record id).
    expect(asks.movedOn('Jarvis', NOW + 2 * MIN, 't2')).toEqual([]);
    expect(asks.pending().map((a) => a.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

function agentOf(store: AgentStateStore, id: number, over: Partial<AgentState>): AgentState {
  const agent = createAgentState({
    id,
    sessionId: `session-${id}`,
    projectDir: 'C:/x',
    jsonlFile: `C:/x/${id}.jsonl`,
    isExternal: false,
    officeTerminal: true,
  });
  Object.assign(agent, over);
  store.set(id, agent);
  return agent;
}

describe('the watch, end to end', () => {
  const JARVIS = { supervision: { kind: 'all' } } as Partial<AgentState>;

  /** Jarvis finishes a turn with this answer (and its «Te toca», if any). */
  const answer = (
    store: AgentStateStore,
    jarvis: AgentState,
    id: string,
    text: string,
    ask?: string,
  ) => {
    jarvis.lastReply = text;
    jarvis.lastReplyId = id;
    jarvis.lastReplyAt = clock;
    jarvis.yourTurn = ask ? { id, text: ask, at: clock } : undefined;
    jarvis.isWaiting = true;
    store.broadcast({ type: 'agentIdentity', id: 1 });
    store.broadcast({ type: 'agentStatus', id: 1, status: 'waiting' });
  };

  it('ask, a problem, the next step: the old one closes, the new one stays', () => {
    const store = new AgentStateStore();
    const asks = list();
    const watch = new PendingAsksWatch(store, asks, () => clock);
    watch.start();
    const jarvis = agentOf(store, 1, JARVIS);
    answer(store, jarvis, 't1', 'Te toca: correr el comando', 'correr el comando');
    clock += MIN;
    jarvis.isWaiting = false;
    jarvis.valentinPromptAt = clock;
    jarvis.valentinPromptText = 'me tira error de política';
    store.broadcast({ type: 'agentIdentity', id: 1 });
    expect(asks.find('p1')?.answeredAt).toBe(clock);
    clock += MIN;
    answer(
      store,
      jarvis,
      't2',
      'Te toca: abrir PowerShell como administrador',
      'abrir PowerShell como administrador',
    );
    expect(asks.find('p1')?.closedHow).toBe('Jarvis siguió después de tu respuesta');
    expect(asks.open().map((a) => a.text)).toEqual(['abrir PowerShell como administrador']);
    clock += MIN;
    jarvis.isWaiting = false;
    jarvis.valentinPromptAt = clock;
    jarvis.valentinPromptText = 'listo';
    store.broadcast({ type: 'agentIdentity', id: 1 });
    expect(asks.open()).toEqual([]);
    expect(asks.find('p2')?.closedHow).toBe('Le contestaste a Jarvis: «listo»');
    watch.stop();
  });

  it('hands every finished answer and what he wrote to the reviewer', async () => {
    const store = new AgentStateStore();
    const asks = list();
    const prompts: string[] = [];
    const reviewer = new AskReviewer(asks, {
      now: () => clock,
      runner: async (prompt) => {
        prompts.push(prompt);
        return { code: 0, out: '{"cerrar":[{"id":"p1","motivo":"pase3 confirmó el deploy"}]}' };
      },
    });
    const watch = new PendingAsksWatch(store, asks, () => clock, reviewer);
    watch.start();
    asks.add({ from: 'Jarvis', text: 'avisarme cuando pase3 termine el deploy' });
    clock += MIN;
    const pase = agentOf(store, 2, { nickname: 'pase3' } as Partial<AgentState>);
    pase.lastReply = 'Deploy terminado en prod, todo verde.';
    pase.lastReplyId = 'x1';
    pase.lastReplyAt = clock;
    pase.isWaiting = true;
    store.broadcast({ type: 'agentStatus', id: 2, status: 'waiting' });
    clock += REVIEW_EVERY_MS;
    watch.tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(prompts[0]).toContain('p1 (pidió Jarvis');
    expect(prompts[0]).toContain('pase3: Deploy terminado en prod, todo verde.');
    expect(asks.find('p1')?.closedHow).toBe('Se cerró solo: pase3 confirmó el deploy');
    watch.stop();
  });
});

describe('the background reviewer', () => {
  const said = (at: number, text: string, who = 'Jarvis') => ({ at, who, text });

  it('runs only with news, at most every few minutes, and closes what it read as done', async () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'probar la bandeja nueva en Chrome' });
    asks.add({ from: 'Jarvis', text: 'decidir el dominio' });
    let runs = 0;
    const reviewer = new AskReviewer(asks, {
      now: () => clock,
      runner: async () => {
        runs++;
        return {
          code: 0,
          out: 'Claro: {"cerrar":[{"id":"P1","motivo":"Valentín dijo que la probó"},{"id":"p9","motivo":"x"}]}',
        };
      },
    });
    expect(await reviewer.tick()).toEqual([]);
    expect(runs).toBe(0);
    reviewer.note(said(NOW + MIN, 'ya probé la bandeja, anda', 'Valentín → Jarvis'));
    clock += REVIEW_EVERY_MS;
    expect(await reviewer.tick()).toEqual([{ id: 'p1', why: 'Valentín dijo que la probó' }]);
    expect(asks.find('p1')?.closedHow).toBe('Se cerró solo: Valentín dijo que la probó');
    expect(asks.find('p2')?.closedAt).toBeUndefined();
    // Nothing new: no second run, however long it waits.
    clock += 3 * REVIEW_EVERY_MS;
    await reviewer.tick();
    expect(runs).toBe(1);
    reviewer.note(said(clock, 'el dominio lo vemos mañana'));
    await reviewer.tick();
    expect(runs).toBe(2);
    // News, but too soon after the last run.
    reviewer.note(said(clock, 'sigo con el dominio'));
    clock += MIN;
    await reviewer.tick();
    expect(runs).toBe(2);
  });

  it('leaves alone what he brought back by hand', async () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'probar la bandeja nueva' });
    asks.answeredBy('[p1] listo', NOW);
    asks.reopen('p1');
    const reviewer = new AskReviewer(asks, {
      now: () => clock,
      runner: async () => ({ code: 0, out: '{"cerrar":[{"id":"p1","motivo":"dijo listo"}]}' }),
    });
    reviewer.note(said(NOW + MIN, 'listo'));
    clock += REVIEW_EVERY_MS;
    expect(await reviewer.tick()).toEqual([]);
    expect(asks.find('p1')?.closedAt).toBeUndefined();
  });

  it('a failed run waits a long while before the next', async () => {
    const asks = list();
    asks.add({ from: 'Jarvis', text: 'probar la bandeja nueva' });
    let runs = 0;
    const reviewer = new AskReviewer(asks, {
      now: () => clock,
      runner: async () => {
        runs++;
        return { code: 1, out: '' };
      },
    });
    reviewer.note(said(NOW + MIN, 'algo'));
    clock += REVIEW_EVERY_MS;
    await reviewer.tick();
    clock += REVIEW_EVERY_MS;
    await reviewer.tick();
    expect(runs).toBe(1);
    clock += REVIEW_BACKOFF_MS;
    await reviewer.tick();
    expect(runs).toBe(2);
  });

  it('reads the model strictly: only ids it asked about, with a reason', () => {
    const asked = new Set(['p1', 'p2']);
    expect(parseVerdicts('nada', asked)).toEqual([]);
    expect(parseVerdicts('{"cerrar": "p1"}', asked)).toEqual([]);
    expect(
      parseVerdicts(
        '{"cerrar":[{"id":"p1"},{"id":"p2","motivo":"ya está"},{"id":"p2","motivo":"otra"}]}',
        asked,
      ),
    ).toEqual([{ id: 'p2', why: 'ya está' }]);
  });

  it('the prompt carries the asks and what was said after them', () => {
    const asks = list();
    const ask = asks.add({ from: 'Jarvis', text: 'mergear el PR del panel' })!;
    const prompt = reviewPrompt([ask], [said(NOW + MIN, 'Mergeado, sigo con el deploy')]);
    expect(prompt).toContain('- p1 (pidió Jarvis a las');
    expect(prompt).toContain('Jarvis: Mergeado, sigo con el deploy');
    expect(prompt).toContain('{"cerrar":[');
  });
});
