import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  effortSetBy,
  firstOtherLink,
  identityMessage,
  observeIdentity,
  seedIdentity,
  ticketOf,
  yourTurnOf,
} from '../src/agentIdentity.js';
import type { AgentState } from '../src/types.js';

const blank = (): AgentState => ({}) as AgentState;

// Record shapes as Claude Code 2.1 writes them (checked against real transcripts).
const aiTitle = (t: string) => ({ type: 'ai-title', aiTitle: t, sessionId: 's' });
const customTitle = (t: string) => ({ type: 'custom-title', customTitle: t });
const taskCreate = (toolUseId: string, subject: string, activeForm?: string) => ({
  type: 'assistant',
  message: {
    content: [
      { type: 'tool_use', id: toolUseId, name: 'TaskCreate', input: { subject, activeForm } },
    ],
  },
});
const taskCreated = (toolUseId: string, id: string) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId }] },
  toolUseResult: { task: { id, subject: 'x' } },
});
const taskUpdate = (taskId: string, status: string) => ({
  type: 'assistant',
  message: {
    content: [{ type: 'tool_use', id: 'u', name: 'TaskUpdate', input: { taskId, status } }],
  },
});

describe('observeIdentity', () => {
  it("takes Claude's generated title, but a /rename wins for good", () => {
    const agent = blank();
    expect(observeIdentity(agent, aiTitle('Modernizar pre-acreditación'))).toBe(true);
    expect(agent.sessionTitle).toBe('Modernizar pre-acreditación');
    observeIdentity(agent, customTitle('WISE-6082 personal'));
    observeIdentity(agent, aiTitle('Otro título generado'));
    expect(agent.sessionTitle).toBe('WISE-6082 personal');
  });

  it('reads cwd and branch, ignoring a detached HEAD', () => {
    const agent = blank();
    observeIdentity(agent, { type: 'user', cwd: 'F:\\repo', gitBranch: 'HEAD' });
    expect(agent.cwd).toBe('F:\\repo');
    expect(agent.gitBranch).toBeUndefined();
    observeIdentity(agent, { type: 'user', gitBranch: 'feat/wise-6082-organizador' });
    expect(agent.gitBranch).toBe('feat/wise-6082-organizador');
  });

  it('reports no change for a record that repeats what it knows', () => {
    const agent = blank();
    observeIdentity(agent, { type: 'user', cwd: 'F:\\repo' });
    expect(observeIdentity(agent, { type: 'user', cwd: 'F:\\repo' })).toBe(false);
  });

  it('knows where the session runs (a terminal or the desktop app)', () => {
    const agent = blank();
    expect(observeIdentity(agent, { type: 'user', entrypoint: 'claude-desktop' })).toBe(true);
    expect(agent.entrypoint).toBe('claude-desktop');
    expect(identityMessage(1, agent).entrypoint).toBe('claude-desktop');
  });

  it('builds the task list from TaskCreate / result id / TaskUpdate', () => {
    const agent = blank();
    observeIdentity(agent, taskCreate('tu1', 'Arreglar checkout', 'Arreglando el checkout'));
    observeIdentity(agent, taskCreated('tu1', '1'));
    observeIdentity(agent, taskCreate('tu2', 'Probar'));
    observeIdentity(agent, taskCreated('tu2', '2'));
    expect(observeIdentity(agent, taskUpdate('1', 'in_progress'))).toBe(true);
    observeIdentity(agent, taskUpdate('2', 'deleted'));
    expect(agent.tasks).toEqual([
      {
        id: '1',
        subject: 'Arreglar checkout',
        activeForm: 'Arreglando el checkout',
        status: 'in_progress',
      },
    ]);
  });

  it('replaces the list on TodoWrite', () => {
    const agent = blank();
    observeIdentity(agent, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 't',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'A', status: 'completed', activeForm: 'Haciendo A' },
                { content: 'B', status: 'in_progress', activeForm: 'Haciendo B' },
              ],
            },
          },
        ],
      },
    });
    expect(agent.tasks?.map((t) => [t.subject, t.status])).toEqual([
      ['A', 'completed'],
      ['B', 'in_progress'],
    ]);
  });
});

describe('ticketOf', () => {
  it('finds a WISE ticket in nickname, title or a lowercase branch', () => {
    expect(ticketOf({ gitBranch: 'feat/wise-6082-organizador' } as AgentState)).toBe('WISE-6082');
    expect(ticketOf({ sessionTitle: 'Arreglo WISE-6305 QR' } as AgentState)).toBe('WISE-6305');
  });

  it('finds it in a worktree folder named after the ticket', () => {
    const cwd = 'F:\\proyectos\\Wiselink\\development\\.worktrees\\expo-online-WISE-5781-recupero';
    expect(ticketOf({ cwd } as AgentState)).toBe('WISE-5781');
  });

  it('does not mistake other KEY-123 lookalikes for tickets', () => {
    expect(ticketOf({ sessionTitle: 'Pasar a UTF-8 y node-20' } as AgentState)).toBeUndefined();
  });
});

describe('identityMessage', () => {
  it('carries what the label and bubble show', () => {
    const agent = { nickname: 'Pagos', sessionTitle: 'WISE-1 x', cwd: 'F:\\r' } as AgentState;
    expect(identityMessage(3, agent)).toEqual({
      type: 'agentIdentity',
      id: 3,
      nickname: 'Pagos',
      title: 'WISE-1 x',
      ticket: 'WISE-1',
      cwd: 'F:\\r',
      gitBranch: undefined,
      repo: undefined,
      area: 'otros',
      tasks: [],
      backgroundTasks: 0,
    });
  });
});

describe('seedIdentity', () => {
  it('recovers title, cwd and tasks from a transcript, later records winning', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-identity-'));
    const file = path.join(dir, 's.jsonl');
    const lines = [
      { type: 'user', cwd: 'F:\\repo' },
      aiTitle('Primer título'),
      taskCreate('tu1', 'Una tarea'),
      taskCreated('tu1', '1'),
      aiTitle('Título nuevo'),
    ];
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n{"partial');
    const agent = blank();
    try {
      expect(seedIdentity(agent, file)).toBe(true);
      expect(agent.sessionTitle).toBe('Título nuevo');
      expect(agent.cwd).toBe('F:\\repo');
      expect(agent.tasks?.[0].id).toBe('1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op for a missing file', () => {
    expect(seedIdentity(blank(), 'F:\\no\\existe.jsonl')).toBe(false);
  });
});

describe('yourTurnOf', () => {
  it('takes the agent\'s own "Te toca:" line first, markdown stripped', () => {
    expect(yourTurnOf('Listo.\n\n**Te toca:** mergear el PR #77 y avisarme')).toBe(
      'mergear el PR #77 y avisarme',
    );
    expect(yourTurnOf('→ te toca: probar en dev')).toBe('probar en dev');
  });

  it('without that line, linked pull requests are what waits on you', () => {
    const one = 'PR abierto: https://github.com/wiselink/wiselink_frontend_webapp/pull/77';
    expect(yourTurnOf(one)).toBe('revisar el PR #77 (wiselink_frontend_webapp)');
    const two = 'back https://github.com/w/api/pull/5 y front https://github.com/w/web/pull/9';
    expect(yourTurnOf(two)).toBe('revisar 2 PRs: #5, #9');
  });

  it('a plain answer, or one that only promises to report back, asks nothing', () => {
    expect(yourTurnOf('Los deploys están en curso. Cuando terminen te aviso.')).toBeUndefined();
  });

  it('keeps up to 240 characters of the ask (at 120, 16 of 118 arrived cut)', () => {
    expect(yourTurnOf(`Te toca: ${'a'.repeat(300)}`)).toHaveLength(240);
    expect(yourTurnOf(`Te toca: ${'b'.repeat(200)}`)).toBe('b'.repeat(200));
  });

  it('carries the first non-PR link and the choices of the answer', () => {
    const agent = blank();
    const text = [
      'PR: https://github.com/w/web/pull/9. Probalo en https://dev.wiselink.app/es/ferias.',
      '¿Cuál preferís?',
      '1. **Mergear ya**',
      '2. **Esperar**',
    ].join('\n');
    const record = { type: 'assistant', uuid: 'x', message: { content: [{ type: 'text', text }] } };
    observeIdentity(agent, record);
    expect(identityMessage(1, agent)).toMatchObject({
      replyLink: 'https://dev.wiselink.app/es/ferias',
      replyChoices: {
        options: [
          { n: 1, label: 'Mergear ya' },
          { n: 2, label: 'Esperar' },
        ],
      },
    });
  });

  it('follows the latest answer: a new one without an ask clears it', () => {
    const agent = blank();
    const reply = (uuid: string, text: string) => ({
      type: 'assistant',
      uuid,
      message: { content: [{ type: 'text', text }] },
    });
    expect(observeIdentity(agent, reply('a', 'Te toca: mergear'))).toBe(true);
    expect(identityMessage(1, agent)).toMatchObject({ yourTurn: 'mergear', yourTurnId: 'a' });
    expect(observeIdentity(agent, reply('b', 'Sigo con los deploys'))).toBe(true);
    expect(identityMessage(1, agent).yourTurn).toBeUndefined();
  });
});

describe('background work', () => {
  const launch = (id: string, input: Record<string, unknown>, name = 'Bash') => ({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: { content: [{ type: 'tool_use', id, name, input }] },
  });
  const launched = (id: string, taskId: string) => ({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: `Command running in background with ID: ${taskId}. Output is being written to: x`,
        },
      ],
    },
  });
  const notified = (id: string) => ({
    type: 'user',
    origin: { kind: 'task-notification' },
    message: {
      content: `<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>`,
    },
  });

  it('counts a run_in_background shell until its notification arrives', () => {
    const agent = blank();
    observeIdentity(
      agent,
      launch('t1', {
        command: 'flutter pub get',
        description: 'Bajar paquetes',
        run_in_background: true,
      }),
    );
    observeIdentity(agent, launched('t1', 'b1'));
    expect(identityMessage(1, agent)).toMatchObject({
      backgroundTasks: 1,
      backgroundLabel: 'Bajar paquetes',
    });
    expect(observeIdentity(agent, notified('t1'))).toBe(true);
    expect(identityMessage(1, agent).backgroundTasks).toBe(0);
  });

  it('a TaskStop of its task id ends it; a plain shell never counts', () => {
    const agent = blank();
    observeIdentity(agent, launch('t2', { command: 'npm run dev', run_in_background: true }));
    observeIdentity(agent, launched('t2', 'b9'));
    observeIdentity(agent, launch('t3', { command: 'git status' }));
    expect(identityMessage(1, agent).backgroundTasks).toBe(1);
    observeIdentity(agent, {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'x',
            content: 'Successfully stopped task: b9 (npm run dev)',
          },
        ],
      },
    });
    expect(identityMessage(1, agent).backgroundTasks).toBe(0);
  });
});

describe('effort', () => {
  it("takes the effort of the main chain's turns, not a subagent's", () => {
    const agent = blank();
    const turn = (effort: string, isSidechain = false) => ({
      type: 'assistant',
      effort,
      isSidechain,
      message: { content: [] },
    });
    expect(observeIdentity(agent, turn('high'))).toBe(true);
    expect(agent.effort).toBe('high');
    observeIdentity(agent, turn('low', true));
    expect(agent.effort).toBe('high');
    expect(identityMessage(1, agent)).toMatchObject({ effort: 'high' });
  });
});

describe('effortSetBy: /effort typed in the terminal', () => {
  it('reads the effort from the command output', () => {
    const out = (text: string) => ({ type: 'user', message: { content: text } });
    expect(
      effortSetBy(out('<local-command-stdout>Set effort level to max (saved as your default…)')),
    ).toBe('max');
    expect(effortSetBy(out('<local-command-stdout>Set effort level to low'))).toBe('low');
    expect(effortSetBy(out('Set effort level to max'))).toBeUndefined();
    expect(
      effortSetBy({ ...out('<local-command-stdout>Set effort level to max'), isSidechain: true }),
    ).toBeUndefined();
  });
});

describe('firstOtherLink', () => {
  it('skips pull requests and trailing punctuation', () => {
    expect(
      firstOtherLink(
        'PR https://github.com/o/r/pull/3/files y el artefacto (https://claude.ai/artifact/abc).',
      ),
    ).toBe('https://claude.ai/artifact/abc');
    expect(firstOtherLink('Release: https://github.com/o/r/releases/tag/v1.0.14, listo')).toBe(
      'https://github.com/o/r/releases/tag/v1.0.14',
    );
    expect(firstOtherLink('Sólo https://github.com/o/r/pull/3')).toBeUndefined();
  });
});
