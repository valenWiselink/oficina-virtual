import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { PendingPermission } from '../src/permissionBroker.js';
import { JarvisTools } from '../src/supervisors/jarvisTools.js';
import { SupervisionTeams, SupervisorRegistry } from '../src/supervisors/supervision.js';
import { supervisorMayApprove } from '../src/supervisors/supervisorGuard.js';
import { ConsentDesk, isYes, linesFromWindow } from '../src/supervisors/valentinConsent.js';
import { forgetWindowInput, noteWindowInput } from '../src/terminal/windowInput.js';

const CWD = 'F:\\proyectos\\app';

describe('a plain yes', () => {
  it('starts with one and says no «no»', () => {
    for (const yes of [
      'sí',
      'Sí.',
      'si',
      'dale',
      'Dale, aprobalo',
      'ok',
      'Jarvis, sí',
      'de una',
      'aprobá',
      'sí, adelante',
    ]) {
      expect(isYes(yes), yes).toBe(true);
    }
    for (const not of [
      'no',
      'sí, pero no lo de producción',
      'esperá',
      'dale no',
      'después vemos',
      'rechazalo',
      '¿qué quiere hacer?',
      '',
    ]) {
      expect(isYes(not), not).toBe(false);
    }
    expect(isYes(`sí ${'y además '.repeat(30)}`)).toBe(false);
  });
});

describe('what left the office window', () => {
  const line = (id: string, at: number) => ({ id, at, text: 'sí' });

  it('each Enter vouches for one line, the first one written just after it', () => {
    const lines = [line('real', 10_000), line('forged', 12_000), line('late', 30_000)];
    expect([...linesFromWindow(lines, [9_800])]).toEqual(['real']);
    expect([...linesFromWindow(lines, [9_800, 11_900])].sort()).toEqual(['forged', 'real']);
    expect(linesFromWindow([line('before', 5_000)], [9_000]).size).toBe(0);
  });
});

describe('what Valentín may approve in words', () => {
  const verdict = (tool: string, input: Record<string, unknown> = {}) =>
    supervisorMayApprove(tool, input, CWD);

  it('external tools that do not touch production or delete, writes outside the folder, unknown tools', () => {
    expect(verdict('mcp__claude_ai_Atlassian_MCP__editJiraIssue')).toMatchObject({
      ok: false,
      askable: true,
    });
    expect(verdict('Edit', { file_path: 'C:\\otro\\a.ts' })).toMatchObject({
      ok: false,
      askable: true,
    });
    expect(verdict('Teleport')).toMatchObject({ ok: false, askable: true });
  });

  it('not production, deleting or risky commands: those he approves himself', () => {
    expect(verdict('mcp__mariadb_prod__mysql_query').ok).toBe(false);
    expect(verdict('mcp__mariadb_prod__mysql_query')).not.toHaveProperty('askable');
    expect(verdict('mcp__mongodb_dev__delete-many')).not.toHaveProperty('askable');
    expect(verdict('Bash', { command: 'git push origin main' })).not.toHaveProperty('askable');
    expect(verdict('Bash', { command: 'rm -rf build' })).not.toHaveProperty('askable');
  });
});

describe('Jarvis approves on Valentín’s word', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-'));
    forgetWindowInput();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T20:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  /** The clock moves on. */
  const later = (ms = 2_000) => vi.setSystemTime(Date.now() + ms);

  function office() {
    const store = new AgentStateStore();
    const registry = new SupervisorRegistry(
      new SupervisionTeams(path.join(dir, 'teams.json')),
      dir,
    );
    registry.attach(store);
    const chat = path.join(dir, 'jarvis.jsonl');
    fs.writeFileSync(chat, '');
    const add = (id: number, over: Record<string, unknown>) =>
      store.set(
        id,
        createAgentState({
          id,
          sessionId: `s${id}`,
          projectDir: '/p',
          jsonlFile: `/p/s${id}.jsonl`,
          isExternal: false,
          cwd: CWD,
          isWaiting: true,
          ...over,
        }),
      );
    add(3, { nickname: 'Pagos' });
    add(11, {
      nickname: 'Jarvis',
      supervision: { kind: 'all' },
      officeTerminal: true,
      jsonlFile: chat,
    });
    const ask = (requestId: string, toolName: string): PendingPermission => ({
      requestId,
      sessionId: 's3',
      toolName,
      toolInput: {},
      cwd: CWD,
      createdAt: Date.now(),
    });
    const pending = [
      ask('p-jira', 'mcp__claude_ai_Atlassian_MCP__editJiraIssue'),
      ask('p-jira2', 'mcp__claude_ai_Atlassian_MCP__transitionJiraIssue'),
      ask('p-prod', 'mcp__mariadb_prod__mysql_query'),
    ];
    const decided: Array<[string, string]> = [];
    const broker = {
      pending: () => pending,
      decide: (id: string, d: { behavior: string }) => {
        decided.push([id, d.behavior]);
        return true;
      },
    };
    const t = new JarvisTools(
      { store, registry, broker, terminalOf: () => undefined, consent: new ConsentDesk() },
      11,
    );
    let n = 0;
    /** A line in Jarvis's chat now; `typed` = it left the window (its Enter a
     *  moment before); `midTurn` = sent while Jarvis worked (only queued). */
    const says = (text: string, typed = true, midTurn = false) => {
      const at = Date.now();
      if (typed) noteWindowInput(11, '\r', at - 200);
      const stamp = { uuid: `u${++n}`, timestamp: new Date(at).toISOString() };
      const record = midTurn
        ? { type: 'attachment', ...stamp, attachment: { type: 'queued_command', prompt: text } }
        : { type: 'user', ...stamp, message: { role: 'user', content: text } };
      fs.appendFileSync(chat, `${JSON.stringify(record)}\n`);
    };
    return { t, store, decided, says };
  }

  it('shows it, waits for his yes from the window, approves once', () => {
    const { t, store, decided, says } = office();
    says('sí'); // before it was shown: not about this
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('La oficina ya le muestra este permiso');
    expect(store.get(11)?.asksValentin).toBe('p-jira');
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('todavía no te contestó');
    says('[Oficina] «Pagos» pide permiso', false); // the office, not him
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('todavía no te contestó');
    later(10_000);
    says('sí', false); // reached Jarvis without the window
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('no salió de la ventana');
    says('[Voz] Sí, dale');
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('Aprobado con el sí de Valentín');
    expect(decided).toEqual([['p-jira', 'allow']]);
    expect(store.get(11)?.asksValentin).toBeUndefined();
    // That yes is used up: the next permission needs its own.
    expect(t.aprobarPermiso('p-jira2')).toContain('La oficina ya le muestra este permiso');
    later();
    expect(t.aprobarPermiso('p-jira2')).toContain('todavía no te contestó');
    expect(decided).toEqual([['p-jira', 'allow']]);
  });

  it('a «no» is not a yes, and rejecting puts the visor away', () => {
    const { t, store, decided, says } = office();
    t.aprobarPermiso('p-jira');
    later();
    says('no, esperá');
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('no es un sí claro');
    expect(t.rechazarPermiso('p-jira', 'Valentín dijo que no')).toContain('Rechazado');
    expect(store.get(11)?.asksValentin).toBeUndefined();
    expect(decided).toEqual([['p-jira', 'deny']]);
  });

  it('a yes sent while Jarvis was working counts (it is only queued)', () => {
    const { t, decided, says } = office();
    t.aprobarPermiso('p-jira');
    later();
    says('dale', true, true);
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('Aprobado con el sí de Valentín');
    expect(decided).toEqual([['p-jira', 'allow']]);
  });

  it('after ten minutes it is shown again and needs a new yes', () => {
    const { t, decided, says } = office();
    t.aprobarPermiso('p-jira');
    later(11 * 60_000);
    says('sí');
    later();
    expect(t.aprobarPermiso('p-jira')).toContain('La oficina ya le muestra este permiso');
    expect(decided).toEqual([]);
  });

  it('production is never approved in words', () => {
    const { t, store, decided, says } = office();
    expect(t.aprobarPermiso('p-prod')).toContain('lo aprueba él mismo');
    later();
    says('sí');
    later();
    expect(t.aprobarPermiso('p-prod')).toContain('lo aprueba él mismo');
    expect(store.get(11)?.asksValentin).toBeUndefined();
    expect(decided).toEqual([]);
  });
});
