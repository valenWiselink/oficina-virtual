/* eslint-disable pixel-agents/no-inline-colors -- the engine parses CSS colors: the test feeds it some */
import { describe, expect, it } from 'vitest';

import type { Meeting } from '../../core/src/messages.js';
import {
  type NucleoState,
  parseRgb,
  stepState,
  stillMoving,
  THINK_SPIN_MS,
} from '../src/nucleo/nucleoEngine.js';
import {
  isThinking,
  needKeyOf,
  nextMeeting,
  presencePhrase,
  speakingPlan,
  untilText,
  workingCount,
} from '../src/nucleo/nucleoRules.js';
import type { AgentView } from '../src/views/agentViews.js';
import { recallView } from '../src/views/useOfficeView.js';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

const view = (over: Partial<AgentView>): AgentView =>
  ({
    id: 1,
    name: 'pase3',
    kind: 'idle',
    statusText: 'Sin tarea',
    supervisedBy: [],
    supervisorNames: [],
    teamSize: 0,
    subagents: [],
    hasTerminal: true,
    canSetRun: true,
    key: 'k',
    tasks: [],
    palette: 0,
    hueShift: 0,
    ...over,
  }) as AgentView;

const meeting = (id: string, startMin: number, endMin: number): Meeting => ({
  id,
  title: id,
  start: NOW + startMin * MIN,
  end: NOW + endMin * MIN,
});

describe('Núcleo: the next meeting', () => {
  it('is the one on now, or the next to start', () => {
    const meetings = [
      meeting('tarde', 372, 402),
      meeting('daily', 12, 42),
      meeting('ayer', -90, -60),
    ];
    expect(nextMeeting(meetings, NOW)?.id).toBe('daily');
    expect(nextMeeting([meeting('daily', -5, 25)], NOW)?.id).toBe('daily');
    expect(nextMeeting([meeting('ayer', -90, -60)], NOW)).toBeUndefined();
  });

  it('says how long until it starts', () => {
    expect(untilText(meeting('d', 12, 42), NOW)).toBe('en 12 min');
    expect(untilText(meeting('d', 372, 402), NOW)).toBe('en 6 h 12 min');
    expect(untilText(meeting('d', 120, 150), NOW)).toBe('en 2 h');
    expect(untilText(meeting('d', -3, 27), NOW)).toBe('ahora');
  });
});

describe('Núcleo: the agents', () => {
  it('counts who is doing something', () => {
    expect(
      workingCount([
        view({ id: 1, kind: 'work' }),
        view({ id: 2, kind: 'think' }),
        view({ id: 3, kind: 'done' }),
        view({ id: 4, kind: 'needs' }),
      ]),
    ).toBe(2);
  });

  it('a new permission or a new first «Te toca» changes what needs him', () => {
    const empty = { queue: { first: undefined, next: [], later: [] } } as never;
    expect(needKeyOf([view({ kind: 'idle' })], empty)).toBe('');
    const asks = view({
      id: 7,
      kind: 'needs',
      permission: { requestId: 'r1' } as AgentView['permission'],
    });
    const withFirst = { queue: { first: { ask: { id: 'p556' } }, next: [], later: [] } } as never;
    expect(needKeyOf([asks], empty)).toBe('r1');
    expect(needKeyOf([asks], withFirst)).toBe('r1,p556');
  });
});

describe('Núcleo: Jarvis in glass', () => {
  const rest: NucleoState = { listen: 0, think: 0, speak: 0, word: 0, need: 0, rot: 0, t: 0 };
  const none = { think: 0, speak: 0, need: 0 };

  it('settles by itself after a key; while he thinks it turns a moment, then stays still', () => {
    let st = { ...rest, listen: 1 };
    expect(stillMoving(st, none, 0)).toBe(true);
    for (let i = 0; i < 40; i++) st = stepState(st, none, 1 / 60);
    expect(st.listen).toBeLessThan(0.01);
    expect(stillMoving(st, none, 700)).toBe(false);
    expect(stillMoving(rest, { ...none, think: 1 }, 1000)).toBe(true);
    // A turn of minutes does not spin for minutes.
    expect(stillMoving(rest, { ...none, think: 1 }, THINK_SPIN_MS + 1)).toBe(false);
    // Speaking keeps it going for as long as he speaks.
    expect(stillMoving(rest, { ...none, speak: 1 }, 10_000)).toBe(true);
  });

  it('goes toward what it is asked, without overshooting', () => {
    let st = rest;
    for (let i = 0; i < 60; i++) st = stepState(st, { think: 1, speak: 0, need: 0 }, 1 / 60);
    expect(st.think).toBeGreaterThan(0.99);
    expect(st.think).toBeLessThanOrEqual(1);
    expect(st.rot).toBeGreaterThan(0);
  });

  it('reads the color behind it', () => {
    expect(parseRgb('rgb(255, 128, 0)')).toEqual([1, 128 / 255, 0]);
    expect(parseRgb('rgba(18, 18, 20, 1)')[0]).toBeCloseTo(18 / 255);
    expect(parseRgb('transparent')).toEqual([0.07, 0.07, 0.08]);
  });

  it('says what he does in one sentence', () => {
    const jarvis = view({ name: 'Jarvis', statusText: 'Revisando el calendario', kind: 'think' });
    expect(presencePhrase('reposo', jarvis)).toBe('Revisando el calendario');
    expect(presencePhrase('escucha', jarvis)).toBe('Lo escucho, señor.');
    expect(presencePhrase('necesita', jarvis)).toBe('Necesito su permiso, señor.');
    expect(presencePhrase('reposo', undefined)).toBe('No está en la oficina');
    expect(isThinking(jarvis)).toBe(true);
    expect(isThinking(view({ kind: 'done' }))).toBe(false);
  });

  it('speaks an answer word by word, quickly and within bounds', () => {
    expect(speakingPlan('Buen día, señor.')).toEqual({ words: 3, everyMs: 150 });
    const long = speakingPlan(Array.from({ length: 100 }, () => 'palabra').join(' '));
    expect(long.words).toBe(60);
    expect(long.everyMs).toBe(45);
  });
});

describe('the view the office opens on', () => {
  const storage = (init: Record<string, string>) => {
    const data = { ...init };
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  };

  it('is Núcleo once after the update, then your choice again', () => {
    const s = storage({ 'oficina.vista': 'tablero' });
    expect(recallView(s)).toBe('nucleo');
    s.setItem('oficina.vista', 'grafo');
    expect(recallView(s)).toBe('grafo');
  });

  it('is Núcleo for a new office', () => {
    expect(recallView(storage({ 'oficina.nucleoPresentado': 'si' }))).toBe('nucleo');
  });
});
