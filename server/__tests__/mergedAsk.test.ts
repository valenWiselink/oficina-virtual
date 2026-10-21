import { afterEach, describe, expect, it, vi } from 'vitest';

import { identityMessage, observeIdentity, yourTurnOf } from '../src/agentIdentity.js';
import {
  mergedMessage,
  prAskOf,
  rememberPrLinks,
  setPrStates,
  type SettleDeps,
  settleMergedAsks,
} from '../src/mergedAsk.js';
import type { AgentState } from '../src/types.js';

const WEB = 'https://github.com/Wiselink/wiselink_frontend_webapp/pull/77';
const CATALOG = 'https://github.com/Wiselink/wiselink_api_digital_catalog/pull/15';

describe('prAskOf: a "te toca" that is only about one PR', () => {
  const reply = `PR: ${WEB}`;
  // Every shape below is a real "Te toca" from the history (2026-10-19/20).
  it.each([
    ['mergear el PR #77 y avisarme', true],
    ['mergear el PR #77 y avisarme para probarlo en dev', true],
    ['revisar y mergear el PR #77 y avisarme', true],
    ['revisar el PR #77 (wiselink_frontend_webapp)', false],
    ['revisar y mergear el PR #77 del webapp', false],
    ['mergear la PR #77 de wiselink-flutter', false],
    ['revisar y mergear el PR #77 a main.', false],
    ['mergear el #77 cuando retomes', false],
    [`mergear ${WEB}`, false],
  ])('«%s»', (ask, notify) => {
    expect(prAskOf(ask, reply)).toEqual({ url: WEB, number: 77, notify });
  });

  it.each([
    // The PR is mentioned, but the ask is something else (the #15 case).
    'cargar el secret OPENAIAPIKEY en el repo del catálogo y sumar las dos líneas a los 3 workflows (están en el PR #15)',
    'crear el secret KEYBACK en el repo del webapp, agregar la línea en los 3 workflows y avisarme para mergear el #77',
    // More to do after the merge: the card must stay.
    'mergear el #77 y probarlo en el iPhone con TestFlight',
    'revisar y mergear el PR #77, y decirme quién lee contacto@ para las bajas',
    'mergear la PR #77, correr el workflow en Codemagic y volver a mandar la 1.1 a revisión',
  ])('not «%s»', (ask) => {
    expect(prAskOf(ask, `${reply} ${CATALOG}`)).toBeUndefined();
  });

  it('needs the PR link, from this answer or one the agent wrote before', () => {
    expect(prAskOf('mergear el #77', 'Listo, sin link')).toBeUndefined();
    const known = new Map<number, string>();
    rememberPrLinks(known, `Abrí el PR: ${WEB}`);
    rememberPrLinks(known, 'Sigo con los tests.');
    expect(prAskOf('mergear el #77', 'Listo, sin link', known)).toEqual({
      url: WEB,
      number: 77,
      notify: false,
    });
  });

  it('remembers a bounded number of links, the latest per number', () => {
    const known = new Map<number, string>();
    for (let n = 1; n <= 40; n++) rememberPrLinks(known, `https://github.com/o/r/pull/${n}`);
    rememberPrLinks(known, 'https://github.com/o/otro/pull/40');
    expect(known.size).toBe(30);
    expect(known.has(1)).toBe(false);
    expect(known.get(40)).toBe('https://github.com/o/otro/pull/40');
  });
});

const quietAgent = (yourTurn: AgentState['yourTurn']): AgentState =>
  ({ isWaiting: true, activeToolIds: new Set(), yourTurn }) as unknown as AgentState;

const deps = (terminal = { write: vi.fn() }) => {
  const send = vi.fn();
  const d: SettleDeps = { terminalOf: () => terminal, send, backgroundOf: () => 0 };
  return { d, send, terminal };
};

const merged = { url: WEB, state: 'merged' as const };
const ask = (notify: boolean) => ({
  text: 'mergear el PR #77 y avisarme',
  id: 'r1',
  prUrl: WEB,
  prAsk: { url: WEB, number: 77, notify },
});

describe('settleMergedAsks', () => {
  it('tells an idle agent that asked for it, once', () => {
    const agent = quietAgent(ask(true));
    const { d, send } = deps();
    expect(settleMergedAsks([[1, agent]], merged, true, d)).toEqual([1]);
    expect(send).toHaveBeenCalledWith(expect.anything(), 'Ya mergeé el PR #77.');
    expect(agent.yourTurn!.merged).toEqual({ number: 77, url: WEB, told: true });
    expect(settleMergedAsks([[1, agent]], merged, true, d)).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('only marks it done when the agent is busy, did not ask, or the merge was not seen live', () => {
    const busy = quietAgent(ask(true));
    busy.isWaiting = false;
    const noNotify = quietAgent(ask(false));
    const old = quietAgent(ask(true));
    const { d, send } = deps();
    settleMergedAsks(
      [
        [1, busy],
        [2, noNotify],
      ],
      merged,
      true,
      d,
    );
    settleMergedAsks([[3, old]], merged, false, d);
    expect(send).not.toHaveBeenCalled();
    for (const a of [busy, noNotify, old]) expect(a.yourTurn!.merged?.told).toBe(false);
  });

  it('never touches an ask about another PR, an agent outside the office, or a closed PR', () => {
    const other = quietAgent({ ...ask(true), prAsk: { url: CATALOG, number: 15, notify: true } });
    const outside = quietAgent(ask(true));
    const send = vi.fn();
    const d: SettleDeps = { terminalOf: () => undefined, send, backgroundOf: () => 0 };
    settleMergedAsks([[1, other]], merged, true, d);
    expect(other.yourTurn!.merged).toBeUndefined();
    settleMergedAsks([[2, outside]], merged, true, d);
    expect(outside.yourTurn!.merged?.told).toBe(false);
    const closed = quietAgent(ask(true));
    expect(settleMergedAsks([[3, closed]], { url: WEB, state: 'closed' }, true, d)).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('words the message as the operator would', () => {
    expect(mergedMessage(12)).toBe('Ya mergeé el PR #12.');
  });
});

describe('a merged PR in a new answer', () => {
  afterEach(() => setPrStates(() => undefined));
  const reply = (uuid: string, text: string) => ({
    type: 'assistant',
    uuid,
    message: { content: [{ type: 'text', text }] },
  });

  it('is not turned into "revisar el PR" (2026-10-20: #77 asked again after its merge)', () => {
    setPrStates((url) => (url === WEB ? 'merged' : undefined));
    expect(yourTurnOf(`Se mergeó: ${WEB}`, (u) => u === WEB)).toBeUndefined();
    const agent = {} as AgentState;
    observeIdentity(agent, reply('a', `Se mergeó: ${WEB}`));
    expect(identityMessage(1, agent).yourTurn).toBeUndefined();
  });

  it('an explicit ask for a PR already known merged arrives done', () => {
    setPrStates((url) => (url === WEB ? 'merged' : undefined));
    const agent = {} as AgentState;
    observeIdentity(agent, reply('a', `Listo: ${WEB}\n\nTe toca: mergear el PR #77 y avisarme`));
    expect(identityMessage(1, agent)).toMatchObject({
      yourTurn: 'mergear el PR #77 y avisarme',
      yourTurnMerged: { number: 77, url: WEB, told: false },
    });
  });
});
