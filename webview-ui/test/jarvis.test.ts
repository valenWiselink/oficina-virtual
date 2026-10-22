import { describe, expect, it } from 'vitest';

import {
  findJarvis,
  jarvisHome,
  jarvisLine,
  jarvisMood,
  visorContext,
  visorKey,
  withoutJarvis,
} from '../src/jarvis/jarvisRules.js';
import type { AgentView } from '../src/views/agentViews.js';

const view = (id: number, over: Partial<AgentView> = {}): AgentView =>
  ({
    id,
    name: `A${id}`,
    kind: 'idle',
    statusText: 'Sin tarea',
    supervisedBy: [],
    supervisorNames: [],
    teamSize: 0,
    subagents: [],
    tasks: [],
    ...over,
  }) as AgentView;

const jarvis = (id: number, over: Partial<AgentView> = {}) =>
  view(id, { name: 'Jarvis', supervision: { kind: 'all' }, ...over });

describe('Jarvis has no avatar', () => {
  it('is the oldest supervisor of everyone', () => {
    expect(findJarvis([view(1), view(2, { supervision: { kind: 'agents' } })])).toBeUndefined();
    expect(findJarvis([jarvis(9), view(1), jarvis(4)])?.id).toBe(4);
  });

  it('leaves the views, and its name every card, but «Lo atiende» stays', () => {
    const j = jarvis(4);
    const views = [
      view(1, { supervisedBy: [4], supervisorNames: ['Jarvis'] }),
      view(2, { supervisedBy: [4, 7], supervisorNames: ['Jarvis', 'Jefa'] }),
      view(3, { supervisedBy: [4], askingSupervisor: { id: 4, name: 'Jarvis' } }),
      j,
    ];
    const office = withoutJarvis(views, j);
    expect(office.map((v) => v.id)).toEqual([1, 2, 3]);
    expect(office[0].supervisorNames).toEqual([]);
    expect(office[1]).toMatchObject({ supervisedBy: [7], supervisorNames: ['Jefa'] });
    expect(office[2].askingSupervisor?.name).toBe('Jarvis');
    expect(withoutJarvis(views, undefined)).toBe(views);
  });
});

describe('its bar and its visor', () => {
  it('rings by its state', () => {
    expect(jarvisMood(undefined)).toBe('away');
    expect(jarvisMood(jarvis(1, { kind: 'think' }))).toBe('busy');
    expect(jarvisMood(jarvis(1, { kind: 'done' }))).toBe('idle');
    expect(jarvisMood(jarvis(1, { kind: 'needs' }))).toBe('needs');
  });

  it('says what it needs, else what it last said', () => {
    expect(jarvisLine(jarvis(1, { lastReplyHead: 'Hecho, señor.' }))).toBe('Hecho, señor.');
    expect(jarvisLine(jarvis(1))).toBe('A su disposición, señor.');
    expect(
      jarvisLine(jarvis(1, { kind: 'needs', yourTurn: '¿Mergeo el 812?', lastReplyHead: 'x' })),
    ).toBe('¿Mergeo el 812?');
    expect(
      jarvisLine(
        jarvis(1, {
          kind: 'needs',
          permission: {
            type: 'permissionPending',
            requestId: 'p1',
            toolName: 'Bash',
            toolInput: { command: 'ls' },
            createdAt: 1,
          },
        }),
      ),
    ).toBe('Necesito su permiso, señor: correr un comando (Bash).');
  });

  it('comes up once per thing it needs', () => {
    expect(visorKey(jarvis(1, { kind: 'done', yourTurnId: 't1' }))).toBeUndefined();
    expect(visorKey(jarvis(1, { kind: 'needs', yourTurnId: 't1' }))).toBe('turno:t1');
    expect(
      visorKey(
        jarvis(1, {
          kind: 'needs',
          yourTurnId: 't1',
          permission: {
            type: 'permissionPending',
            requestId: 'p9',
            toolName: 'Read',
            toolInput: {},
            createdAt: 1,
          },
        }),
      ),
    ).toBe('permiso:p9');
  });

  it('is called where most of the office works', () => {
    const dirs = [
      { name: 'oficina', path: 'F:\\proyectos\\oficina', source: 'user' as const },
      {
        name: 'development',
        path: 'F:\\proyectos\\Wiselink\\development',
        source: 'user' as const,
      },
    ];
    const views = [view(1, { dir: 'development' }), view(2, { dir: 'development' })];
    expect(jarvisHome(dirs, views)?.name).toBe('development');
    expect(jarvisHome(dirs, [])?.name).toBe('oficina');
    expect(jarvisHome([], views)).toBeUndefined();
  });
});

describe('the visor’s context line', () => {
  it('is what came before «Te toca:», never the ask again', () => {
    expect(
      visorContext(
        'Coral terminó el PR 812, señor. Te toca: ¿lo mergeo? Le recomi…',
        '¿lo mergeo?',
      ),
    ).toBe('Coral terminó el PR 812, señor.');
    expect(visorContext('Te toca: ¿lo mergeo?', '¿lo mergeo?')).toBeUndefined();
    expect(visorContext('¿lo mergeo?', '¿lo mergeo?')).toBeUndefined();
    expect(visorContext(undefined, 'x')).toBeUndefined();
  });
});
