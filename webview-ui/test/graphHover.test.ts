import { describe, expect, it } from 'vitest';

import { type AgentView, recentTools } from '../src/views/agentViews.js';
import {
  cardSpot,
  focusOf,
  HOVER_DWELL_MS,
  HoverDwell,
  hoverFacts,
  overSpot,
} from '../src/views/graphHover.js';

const view = (id: number, over: Partial<AgentView> = {}): AgentView => ({
  id,
  canSetRun: false,
  supervisorNames: [],
  teamSize: 0,
  supervisedBy: [],
  name: `A${id}`,
  key: `k${id}`,
  palette: 0,
  hueShift: 0,
  kind: 'idle',
  statusText: '',
  subagents: [],
  tasks: [],
  hasTerminal: true,
  ...over,
});
const sub = (id: number, kind: AgentView['kind'] = 'work') => ({
  id,
  label: `S${id}`,
  kind,
  statusText: 'Leyendo a.ts',
  recent: ['Buscando en el código'],
});

describe('focusOf: what stays crisp while hovering', () => {
  const office = [
    view(1, { kind: 'meet', subagents: [sub(-1), sub(-2, 'research')], supervisedBy: [3] }),
    view(2, { kind: 'needs', supervisedBy: [3] }),
    view(3, { supervision: { kind: 'all' } }),
    view(4, { subagents: [sub(-4)] }),
  ];

  it('the agent, its meeting, its supervisor and the library its member reads in', () => {
    expect([...focusOf(office, { id: 1 })].sort()).toEqual(
      ['a1', 'a3', 'library', 's-1', 's-2'].sort(),
    );
  });

  it('a member focuses its whole meeting (and nobody else)', () => {
    const keys = focusOf(office, { id: 1, member: -2 });
    expect(keys.has('s-1')).toBe(true);
    expect(keys.has('a2')).toBe(false);
    expect(keys.has('a4')).toBe(false);
  });

  it('a supervisor brings its team; one that waits on you brings "Vos"', () => {
    expect([...focusOf(office, { id: 3 })].sort()).toEqual(['a1', 'a2', 'a3']);
    expect(focusOf(office, { id: 2 }).has('vos')).toBe(true);
  });

  it('whoever a member passed a file to', () => {
    const keys = focusOf(office, { id: 4 }, [{ fromId: -4, toId: -1 }]);
    expect(keys.has('s-1')).toBe(true);
    expect(keys.has('a1')).toBe(false);
  });
});

describe('HoverDwell', () => {
  it('shows after resting on the same thing, and goes at once when it leaves', () => {
    const dwell = new HoverDwell();
    expect(dwell.update({ id: 1 }, 0)).toBeNull();
    expect(dwell.update({ id: 1 }, HOVER_DWELL_MS - 1)).toBeNull();
    const shown = dwell.update({ id: 1 }, HOVER_DWELL_MS);
    expect(shown).toEqual({ id: 1 });
    // The same object while it stays (the page re-renders only on changes).
    expect(dwell.update({ id: 1 }, HOVER_DWELL_MS + 500)).toBe(shown);
    expect(dwell.update(null, HOVER_DWELL_MS + 600)).toBeNull();
  });

  it('moving onto another one starts over (a member is not its lead)', () => {
    const dwell = new HoverDwell();
    dwell.update({ id: 1 }, 0);
    dwell.update({ id: 1 }, 400);
    expect(dwell.update({ id: 1, member: -2 }, 410)).toBeNull();
    expect(dwell.update({ id: 1, member: -2 }, 410 + HOVER_DWELL_MS)).toEqual({
      id: 1,
      member: -2,
    });
  });
});

describe('hoverFacts', () => {
  it('says whole what the label clips, and how long it waits', () => {
    const v = view(1, {
      name: 'Langostino del grafo vivo, con nombre largo',
      kind: 'needs',
      statusText: 'Te toca: mergear el PR del webapp y avisarme',
      waitingSince: 0,
      ticket: 'WISE-6400',
      folder: 'oficina-virtual',
      progress: '2/5',
      contextPct: 41,
      lastReplyHead: 'Listo el PR.',
    });
    expect(hoverFacts([v], { id: 1 }, 12 * 60_000)).toMatchObject({
      name: 'Langostino del grafo vivo, con nombre largo',
      status: 'Te toca: mergear el PR del webapp y avisarme',
      waited: 'Te espera hace 12 min',
      meta: 'WISE-6400 · oficina-virtual',
      tasks: 'Tareas 2 de 5',
      context: 'Contexto 41%',
      reply: 'Listo el PR.',
    });
  });

  it('a member: its errand, its state, its meeting and its latest tools', () => {
    const lead = view(1, { name: 'Jefa', subagents: [sub(-7)] });
    expect(hoverFacts([lead], { id: 1, member: -7 }, 0)).toMatchObject({
      name: 'S-7',
      status: 'Leyendo a.ts',
      lead: 'En la junta de Jefa',
      tools: ['Buscando en el código'],
    });
    expect(hoverFacts([lead], { id: 1, member: -99 }, 0)).toBeNull();
  });
});

describe('cardSpot', () => {
  const card = { w: 260, h: 120 };
  const view = { w: 1000, h: 600 };

  it('beside the node, on its right', () => {
    expect(cardSpot({ x: 300, y: 300, r: 40 }, card, view)).toEqual({ left: 352, top: 240 });
  });

  it('on its left near the right border, and never past the edges', () => {
    expect(cardSpot({ x: 900, y: 300, r: 40 }, card, view).left).toBe(900 - 40 - 12 - 260);
    expect(cardSpot({ x: 300, y: 10, r: 40 }, card, view).top).toBe(8);
    expect(cardSpot({ x: 300, y: 590, r: 40 }, card, view).top).toBe(600 - 120 - 8);
  });
});

describe('recentTools', () => {
  it('the latest three finished, newest first, in Spanish', () => {
    const rows = ['Reading a.ts', 'Editing b.ts', 'Searching code', 'Running: npm test'].map(
      (status) => ({ status, done: true }),
    );
    expect(recentTools(rows)).toEqual([
      'Corriendo: npm test',
      'Buscando en el código',
      'Editando b.ts',
    ]);
    expect(recentTools([...rows, { status: 'Reading c.ts', done: false }])[0]).toBe(
      'Corriendo: npm test',
    );
    expect(recentTools(undefined)).toEqual([]);
  });
});

describe('overSpot (the grown pill)', () => {
  it('centred on the pill, inside the view', () => {
    const view = { w: 1000, h: 600 };
    expect(overSpot({ x: 400, y: 200, w: 100, h: 20 }, { w: 300, h: 90 }, view)).toEqual({
      left: 300,
      top: 165,
    });
    expect(overSpot({ x: 0, y: 0, w: 100, h: 20 }, { w: 300, h: 90 }, view)).toEqual({
      left: 8,
      top: 8,
    });
  });
});
