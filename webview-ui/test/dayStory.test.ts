import { describe, expect, it } from 'vitest';

import type { DayLogEntry, PrStatus } from '../../core/src/messages.js';
import { MIX_BLACK, MIX_WHITE, TERMINAL_PRESETS } from '../src/constants.js';
import { dayStory, sameTopic } from '../src/history/dayStory.js';
import {
  customScheme,
  forClaude,
  luminance,
  mix,
  presetScheme,
} from '../src/terminal/terminalSchemes.js';
import type { AgentView } from '../src/views/agentViews.js';

const e = (over: Partial<DayLogEntry>): DayLogEntry =>
  ({ at: 0, kind: 'termino', agent: 'Pagos', text: '', ...over }) as DayLogEntry;
const view = (id: number, name: string, folder: string) =>
  ({ id, name, folder, palette: 0, hueShift: 0 }) as AgentView;

describe('dayStory', () => {
  const pr = 'https://github.com/o/api/pull/7';
  const statuses = new Map<string, PrStatus>([
    [pr, { url: pr, state: 'merged', title: 'Pagos MP' }],
  ]);
  const story = dayStory(
    [
      e({ at: 1, agentId: 1, kind: 'tarea', text: 'Completó: Endpoint de cobro' }),
      e({ at: 2, agentId: 1, kind: 'tarea', text: 'Completó: Tests' }),
      e({ at: 3, agentId: 1, kind: 'tetoca', text: 'Mergear el PR', prUrl: pr }),
      e({ at: 4, agentId: 2, agent: 'Web', kind: 'termino' }),
      e({ at: 5, agentId: 3, agent: 'Ruido', kind: 'permiso' }),
      e({ at: 6, agent: 'Cerrado', kind: 'tarea', text: 'Completó: Migración', folder: 'api' }),
    ],
    [view(1, 'Pagos', 'api'), view(2, 'Web', 'webapp')],
    statuses,
  );

  it('groups by project and drops agents that did nothing', () => {
    expect(story.projects.map((p) => p.name)).toEqual(['api']);
  });

  it('keeps a closed agent in its project by the folder the line recorded', () => {
    expect(story.projects[0].streams.map((s) => s.agent)).toContain('Cerrado');
  });

  it('tells what got done, the PR with its fate and what was left for you', () => {
    const pagos = story.projects[0].streams[0];
    expect(pagos.done).toEqual(['Endpoint de cobro', 'Tests']);
    expect(pagos.prs).toEqual([{ url: pr, label: 'Pagos MP', state: 'merged' }]);
    expect(pagos.leftForYou).toEqual(['Mergear el PR']);
  });

  it('sums the day in one headline', () => {
    expect(story.headline).toBe('2 agentes en 1 proyecto · 3 tareas · 1 PR (1 mergeado)');
  });

  it('folds the sessions where nothing got done', () => {
    expect(story.minor.map((s) => s.agent)).toEqual(['Web']);
  });
});

describe('dayStory: what each agent did', () => {
  const story = dayStory(
    [
      e({ at: 1, agentId: 1, summary: 'Encontré la causa del bug.', folder: 'api' }),
      e({ at: 2, agentId: 1, summary: 'Lo arreglé con un test.', edits: 3, folder: 'api' }),
      e({ at: 3, agentId: 1, summary: 'Lo arreglé con un test.', folder: 'api' }),
      e({ at: 4, agentId: 2, agent: 'Hola que tal', summary: '¡Hola! ¿En qué te ayudo?' }),
      e({ at: 5, agentId: 3, agent: 'development', folder: 'api' }),
      e({ at: 6, agentId: 3, agent: 'development', folder: 'api' }),
      e({ at: 7, agentId: 4, agent: 'Charla', summary: 'Te expliqué el flujo.', folder: 'web' }),
      e({ at: 8, agentId: 4, agent: 'Charla', summary: 'Sí, ya está en dev.', folder: 'web' }),
    ],
    [],
    new Map(),
  );

  it('tells its turns newest first, without repeats, with the files it edited', () => {
    const [stream] = story.projects.find((p) => p.name === 'api')!.streams;
    expect(stream.did).toEqual(['Lo arreglé con un test.', 'Encontré la causa del bug.']);
    expect(stream.edits).toBe(3);
  });

  it('a greeting or turns with nothing to tell are short sessions; talk through turns is not', () => {
    expect(story.minor.map((s) => s.agent).sort()).toEqual(['Hola que tal', 'development']);
    expect(story.projects.map((p) => p.name).sort()).toEqual(['api', 'web']);
  });
});

describe('dayStory: a session told by its recap', () => {
  const story = dayStory(
    [
      e({
        at: 1,
        agentId: 1,
        agent: 'Pagos',
        kind: 'recap',
        folder: 'api',
        text: 'Arreglé el cobro.',
      }),
      e({ at: 2, agentId: 1, agent: 'Pagos', summary: 'Corrí los tests.', folder: 'api' }),
      e({
        at: 3,
        agentId: 1,
        agent: 'Pagos',
        kind: 'recap',
        folder: 'api',
        text: 'Arreglamos el sistema de cobros de Mercado Pago que tenía un bug. Falta el pase a prod.',
      }),
      e({ at: 4, agentId: 2, agent: 'Eventos', summary: 'Mejoré la pantalla.', folder: 'api' }),
      e({ at: 5, agentId: 2, agent: 'Eventos', summary: 'Ajusté los textos.', folder: 'api' }),
      e({ at: 6, agentId: 3, agent: 'Saludo', kind: 'recap', text: 'Sólo nos saludamos.' }),
      e({
        at: 7,
        agentId: 4,
        agent: 'Mapas',
        kind: 'recap',
        folder: 'api',
        text: 'Estamos analizando los mapas de calor con siete subagentes, que siguen trabajando.',
      }),
      e({
        at: 8,
        agentId: 5,
        agent: 'Supervisor',
        kind: 'recap',
        folder: 'api',
        text: '«Pagos» dejó listo el cobro.',
      }),
      e({
        at: 9,
        agentId: 6,
        agent: 'Catálogo',
        kind: 'recap',
        folder: 'catalogo',
        text: 'Estoy rediseñando la revisión del PDF y ya está mergeada a develop (#42).',
      }),
    ],
    [],
    new Map(),
  );

  it('leads with its newest recap, cut to what got done; else its last turn', () => {
    const [api] = story.projects;
    const told = api.streams.filter((s) => s.agent === 'Pagos' || s.agent === 'Eventos');
    expect(told.map((s) => [s.agent, s.title])).toEqual([
      ['Pagos', 'Arreglamos el sistema de cobros de Mercado Pago que tenía un bug.'],
      ['Eventos', 'Ajusté los textos.'],
    ]);
  });

  it('lists what you achieved per project: no agents, PRs, work still going on or reports', () => {
    expect(story.achievements).toEqual([
      {
        project: 'api',
        items: ['Arreglamos el sistema de cobros de Mercado Pago que tenía un bug.'],
      },
      {
        project: 'catalogo',
        items: ['Estoy rediseñando la revisión del PDF y ya está mergeada a develop.'],
      },
    ]);
    // A recap that says nothing happened tells nothing: the greeting is not there.
    expect(
      [...story.minor, ...story.projects.flatMap((p) => p.streams)].map((s) => s.agent),
    ).not.toContain('Saludo');
  });
});

describe('dayStory: one card per session', () => {
  it("puts a recap read from the transcript under the session's office name", () => {
    const story = dayStory(
      [
        e({
          at: 1,
          agentId: 1,
          agent: 'Captación',
          sessionId: 's1',
          summary: 'Armé el PR.',
          folder: 'web',
        }),
        e({
          at: 2,
          agent: 'oficina-wiselink-b022',
          kind: 'recap',
          sessionId: 's1',
          folder: 'web',
          text: 'Sumate al pedido ya está en dev.',
        }),
      ],
      [],
      new Map(),
    );
    expect(story.projects[0].streams.map((s) => [s.agent, s.title])).toEqual([
      ['Captación', 'Sumate al pedido ya está en dev.'],
    ]);
  });
});

describe('terminal schemes', () => {
  const dark = TERMINAL_PRESETS.find((p) => p.look === 'dark')!.palette;
  const light = TERMINAL_PRESETS.find((p) => p.look === 'light')!.palette;

  it('mixes colours and tells dark from light', () => {
    expect(mix(MIX_BLACK, MIX_WHITE, 0)).toBe(MIX_BLACK);
    expect(mix(MIX_BLACK, MIX_WHITE, 1)).toBe(MIX_WHITE);
    expect(luminance(dark.background)).toBeLessThan(0.4);
    expect(luminance(light.background)).toBeGreaterThan(0.4);
  });

  it('derives decorations from every preset as #rrggbb', () => {
    for (const p of TERMINAL_PRESETS) {
      const s = presetScheme(p);
      for (const c of [s.prompt.background, s.prompt.foreground, s.search.matchBackground]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('builds a custom scheme on the base that suits its background', () => {
    const own = { background: light.background, foreground: dark.background, accent: dark.green };
    expect(customScheme(own).look).toBe('light');
    expect(customScheme({ ...own, background: dark.background }).theme.cursor).toBe(dark.green);
  });

  it("swaps ANSI black and white when Claude Code's theme is the other brightness", () => {
    const scheme = presetScheme(TERMINAL_PRESETS.find((p) => p.look === 'dark')!);
    expect(forClaude(scheme, 'dark')).toBe(scheme);
    const swapped = forClaude(scheme, 'light').theme;
    expect(swapped.black).toBe(dark.white);
    expect(swapped.white).toBe(dark.black);
  });
});

describe('dayStory: sessions sharing a name', () => {
  it('keeps them apart, and counts what a session finished before moving on', () => {
    const story = dayStory(
      [
        e({
          at: 1,
          agent: 'Langostino',
          sessionId: 'a',
          kind: 'recap',
          folder: 'app',
          text: 'La pantalla de tus datos ya está en main.',
        }),
        e({
          at: 2,
          agent: 'Langostino',
          sessionId: 'b',
          kind: 'recap',
          folder: 'oficina',
          text: 'Rehice el catálogo de Clawds.',
        }),
        e({
          at: 3,
          agent: 'Panel',
          sessionId: 'c',
          kind: 'recap',
          folder: 'web',
          text: '"Mis datos" ya está en dev.',
        }),
        e({
          at: 4,
          agent: 'Panel',
          sessionId: 'c',
          kind: 'recap',
          folder: 'web',
          text: 'Estamos con los botones de QR y firma.',
        }),
      ],
      [],
      new Map(),
    );
    expect(
      story.projects.flatMap((p) => p.streams).filter((s) => s.agent === 'Langostino'),
    ).toHaveLength(2);
    expect(story.achievements).toEqual(
      expect.arrayContaining([
        { project: 'app', items: ['La pantalla de tus datos ya está en main.'] },
        { project: 'oficina', items: ['Rehice el catálogo de Clawds.'] },
        { project: 'web', items: ['"Mis datos" ya está en dev.'] },
      ]),
    );
  });
});

describe('sameTopic', () => {
  it('tells a restated thread from a new achievement', () => {
    expect(
      sameTopic(
        'Arreglé el cobro.',
        'Arreglamos el sistema de cobros de Mercado Pago que tenía un bug.',
      ),
    ).toBe(true);
    expect(
      sameTopic(
        '"Mis datos" del panel del expositor ya está en dev, sin datos laborales.',
        'WISE-6365 ya está en dev: el menú de cada empleado tiene "Descargar QR" y "Generar firma".',
      ),
    ).toBe(false);
  });
});
