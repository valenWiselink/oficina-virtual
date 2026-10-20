import { describe, expect, it } from 'vitest';

import type { AgentIdentity, PermissionPending } from '../../core/src/messages.js';
import {
  type AgentView,
  buildAgentViews,
  type CharacterFacts,
  type ViewInputs,
  withSupervisionNames,
} from '../src/views/agentViews.js';

const ch = (over: Partial<CharacterFacts> = {}): CharacterFacts => ({
  palette: 1,
  hueShift: 0,
  isActive: true,
  bubbleType: null,
  contextTokens: 0,
  maxContextTokens: 1_000_000,
  ...over,
});

function inputs(over: Partial<ViewInputs> = {}): ViewInputs {
  return {
    agentIds: [1],
    characters: new Map([[1, ch()]]),
    agentTools: {},
    subagents: [],
    subagentTools: {},
    permissions: [],
    terminalAgentIds: [],
    identity: () => undefined,
    finished: () => false,
    yourTurnDone: () => false,
    inTurn: () => false,
    researching: () => false,
    ...over,
  };
}

const one = (over: Partial<ViewInputs>) => buildAgentViews(inputs(over))[0];

describe('buildAgentViews', () => {
  it('an agent with no evidence of a turn is free, not "thinking"', () => {
    expect(one({})).toMatchObject({ kind: 'idle', statusText: 'Sin tarea' });
  });

  it('a held permission puts it in "Te necesita", with the request attached', () => {
    const permission = { type: 'permissionPending', requestId: 'r', id: 1 } as PermissionPending;
    expect(one({ permissions: [permission] })).toMatchObject({ kind: 'needs', permission });
  });

  it('a running tool is work, shown in Spanish or by its task phrase', () => {
    const agentTools = { 1: [{ status: 'Reading a.go', done: false }] };
    expect(one({ agentTools })).toMatchObject({ kind: 'work', statusText: 'Leyendo a.go' });
    const identity = (): AgentIdentity =>
      ({
        type: 'agentIdentity',
        id: 1,
        tasks: [
          { id: '1', subject: 'x', activeForm: 'Revisando el SP de pagos', status: 'in_progress' },
        ],
      }) as AgentIdentity;
    expect(one({ agentTools, identity })).toMatchObject({
      statusText: 'Revisando el SP de pagos',
      progress: '0/1',
    });
  });

  it('two or more subagents at once is a meeting', () => {
    const subagents = [
      { id: -1, parentAgentId: 1, parentToolId: 'a', label: 'CTO' },
      { id: -2, parentAgentId: 1, parentToolId: 'b', label: 'Revisor' },
    ];
    const view = one({ subagents });
    expect(view.kind).toBe('meet');
    expect(view.subagents.map((s) => s.label)).toEqual(['CTO', 'Revisor']);
  });

  it('a finished turn with work still running in the background is not "Terminó"', () => {
    const identity = (): AgentIdentity =>
      ({
        type: 'agentIdentity',
        id: 1,
        tasks: [],
        backgroundTasks: 1,
        backgroundLabel: 'flutter pub get',
      }) as AgentIdentity;
    expect(one({ identity, finished: () => true })).toMatchObject({
      kind: 'work',
      statusText: 'Esperando: flutter pub get',
    });
  });

  it('one sub-agent still working keeps a finished lead in "Trabajando"', () => {
    const subagents = [
      { id: -1, parentAgentId: 1, parentToolId: 'wf:r:a', label: 'propuesta:diseno' },
    ];
    expect(one({ subagents, finished: () => true })).toMatchObject({
      kind: 'work',
      statusText: 'Con un subagente: propuesta:diseno',
    });
  });

  it('a turn in progress without a tool is thinking; a finished one says so', () => {
    expect(one({ inTurn: () => true }).kind).toBe('think');
    expect(one({ finished: () => true })).toMatchObject({ kind: 'done', statusText: 'Terminó' });
  });

  it('an idle session is not a question: only AskUserQuestion is', () => {
    // idle_prompt arrives as a finished turn; it must read "Terminó".
    expect(one({ finished: () => true }).statusText).toBe('Terminó');
    const agentTools = { 1: [{ status: 'Waiting for your answer', done: false }] };
    expect(one({ agentTools })).toMatchObject({
      kind: 'needs',
      statusText: 'Te hizo una pregunta',
    });
  });

  it('a finished turn that leaves you something is "Te toca", until marked done', () => {
    const identity = (): AgentIdentity =>
      ({
        type: 'agentIdentity',
        id: 1,
        tasks: [],
        yourTurn: 'revisar el PR #77 (webapp)',
        yourTurnId: 'u1',
      }) as AgentIdentity;
    expect(one({ identity, finished: () => true })).toMatchObject({
      kind: 'needs',
      statusText: 'Te toca: revisar el PR #77 (webapp)',
      yourTurnId: 'u1',
    });
    // Still working: the ask is not shown yet.
    expect(one({ identity, inTurn: () => true }).kind).toBe('think');
    // Marked done: back to plain "Terminó".
    expect(
      one({ identity, finished: () => true, yourTurnDone: (id) => id === 'u1' }),
    ).toMatchObject({ kind: 'done', yourTurnId: undefined });
  });

  it('names it by nickname, then title, then folder; folder shown only if different', () => {
    const identity = (): AgentIdentity =>
      ({
        type: 'agentIdentity',
        id: 1,
        title: 'Notificaciones',
        cwd: 'F:\\repo\\wiselink_api_crm',
        tasks: [],
      }) as AgentIdentity;
    expect(one({ identity })).toMatchObject({ name: 'Notificaciones', folder: 'wiselink_api_crm' });
  });
});

describe('withSupervisionNames: only the supervisor comes to you', () => {
  const v = (over: Partial<AgentView>): AgentView =>
    ({ id: 1, name: 'A', kind: 'work', statusText: '', supervisedBy: [], ...over }) as AgentView;

  it('a supervised agent that needs something waits on its supervisor', () => {
    const [boss, worker, alone] = withSupervisionNames([
      v({ id: 10, name: 'Jefa', kind: 'needs', statusText: 'Te toca: elegir' }),
      v({
        id: 2,
        name: 'Pagos',
        kind: 'needs',
        statusText: 'Necesita tu permiso',
        supervisedBy: [10],
      }),
      v({ id: 3, name: 'Solo', kind: 'needs', statusText: 'Necesita tu permiso' }),
    ]);
    expect(boss.kind).toBe('needs');
    expect(worker).toMatchObject({
      kind: 'work',
      statusText: 'Lo atiende Jefa',
      askingSupervisor: { id: 10, name: 'Jefa' },
      supervisorNames: ['Jefa'],
    });
    expect(alone.kind).toBe('needs');
    expect(boss.teamSize).toBe(1);
  });

  it('with its supervisor gone, it comes to you again', () => {
    const [worker] = withSupervisionNames([v({ id: 2, kind: 'needs', supervisedBy: [10] })]);
    expect(worker.kind).toBe('needs');
    expect(worker.askingSupervisor).toBeUndefined();
  });
});
