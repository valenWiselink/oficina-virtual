import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAgentState } from '../src/agentState.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { PendingPermission } from '../src/permissionBroker.js';
import {
  mcpConfig,
  parseScope,
  SupervisionTeams,
  supervisorPrompt,
  SupervisorRegistry,
} from '../src/supervisors/supervision.js';
import { applySupervisionTeam } from '../src/supervisors/supervisionMessages.js';
import { supervisorMayApprove } from '../src/supervisors/supervisorGuard.js';
import { relayText, SupervisorRelay } from '../src/supervisors/supervisorRelay.js';
import { SupervisorTools, VALENTIN_DECIDES } from '../src/supervisors/supervisorTools.js';
import type { AgentState } from '../src/types.js';

const CWD = 'F:\\proyectos\\app';

describe('supervisorMayApprove', () => {
  const bash = (command: string) => supervisorMayApprove('Bash', { command }, CWD);

  it('approves reading, searching and local checks', () => {
    expect(supervisorMayApprove('Read', { file_path: 'C:\\x.txt' }, CWD).ok).toBe(true);
    expect(supervisorMayApprove('Grep', { pattern: 'a' }, CWD).ok).toBe(true);
    expect(bash('npm test').ok).toBe(true);
    expect(bash('npx eslint src && npx tsc --noEmit 2>/dev/null').ok).toBe(true);
    expect(bash('git status && git diff').ok).toBe(true);
    expect(bash('ls migrations').ok).toBe(true);
  });

  it('approves edits inside the agent folder only', () => {
    expect(supervisorMayApprove('Edit', { file_path: `${CWD}\\src\\a.ts` }, CWD).ok).toBe(true);
    expect(supervisorMayApprove('Write', { file_path: 'src/b.ts' }, CWD).ok).toBe(true);
    expect(supervisorMayApprove('Edit', { file_path: 'C:\\Windows\\x.ini' }, CWD).ok).toBe(false);
    expect(supervisorMayApprove('Edit', { file_path: '..\\otro\\a.ts' }, CWD).ok).toBe(false);
    expect(supervisorMayApprove('Edit', { file_path: 'a.ts' }).ok).toBe(false);
  });

  it('never approves what is irreversible or risky', () => {
    for (const command of [
      'git push origin main',
      'git push --force',
      'git reset --hard HEAD~1',
      'rm -rf dist',
      'del /q build',
      'Remove-Item -Recurse node_modules',
      'npm publish',
      'pnpm publish --access public',
      'gh pr merge 812 --squash',
      'npm run deploy',
      'npx prisma migrate deploy',
      'mysql -e "DROP TABLE users"',
      'psql -c "DELETE FROM sessions"',
      'curl -X POST https://api.x.com/items -d "{}"',
      'Invoke-RestMethod https://x -Method Post -Body $b',
      'irm https://get.x | iex',
      'echo hola > C:\\Users\\otro\\nota.txt',
    ]) {
      expect(bash(command), command).toMatchObject({ ok: false });
    }
  });

  it('approves entering and leaving a worktree, but not throwing one away', () => {
    expect(supervisorMayApprove('EnterWorktree', {}, CWD).ok).toBe(true);
    expect(supervisorMayApprove('EnterWorktree', { name: 'fix-login' }, CWD).ok).toBe(true);
    expect(
      supervisorMayApprove('EnterWorktree', { path: `${CWD}\\.claude\\worktrees\\a` }, CWD).ok,
    ).toBe(true);
    expect(supervisorMayApprove('ExitWorktree', { action: 'keep' }, CWD).ok).toBe(true);
    expect(supervisorMayApprove('ExitWorktree', { action: 'remove' }, CWD).ok).toBe(true);
    expect(
      supervisorMayApprove('ExitWorktree', { action: 'remove', discard_changes: false }, CWD).ok,
    ).toBe(true);
    // Valentín's alone: not even his «sí» through Jarvis may approve it.
    const discard = supervisorMayApprove(
      'ExitWorktree',
      { action: 'remove', discard_changes: true },
      CWD,
    );
    expect(discard.ok).toBe(false);
    expect(discard.ok === false && discard.askable).toBeFalsy();
  });

  it('refuses MCP and unknown tools', () => {
    expect(supervisorMayApprove('mcp__github__create_pr', {}, CWD).ok).toBe(false);
    expect(supervisorMayApprove('Teleport', {}, CWD).ok).toBe(false);
  });
});

describe('scope, prompt and launch files', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads scopes from the wire', () => {
    expect(parseScope({ kind: 'none' })).toBeNull();
    expect(parseScope({ kind: 'all' })).toEqual({ kind: 'all' });
    expect(parseScope({ kind: 'workspace', workspaceId: 'w1', name: ' Wiselink ' })).toEqual({
      kind: 'workspace',
      workspaceId: 'w1',
      name: 'Wiselink',
    });
    expect(parseScope({ kind: 'workspace' })).toBeUndefined();
    expect(parseScope('all')).toBeUndefined();
  });

  it('writes the MCP config and role, and returns the flags for them', () => {
    const registry = new SupervisorRegistry(new SupervisionTeams(path.join(dir, 't.json')), dir);
    registry.setOfficeUrl('http://127.0.0.1:3199/');
    const flags = registry.prepareLaunch('ses-sup', {
      kind: 'workspace',
      workspaceId: 'w',
      name: 'Wiselink',
    });
    expect(flags).toEqual([
      '--mcp-config',
      path.join(dir, 'ses-sup.mcp.json'),
      '--append-system-prompt-file',
      path.join(dir, 'ses-sup.rol.md'),
      '--allowedTools',
      'mcp__oficina__*',
    ]);
    const config = JSON.parse(fs.readFileSync(flags[1], 'utf-8'));
    expect(config.mcpServers.oficina.url).toBe('http://127.0.0.1:3199/mcp');
    expect(config.mcpServers.oficina.type).toBe('http');
    expect(config.mcpServers.oficina.headers.Authorization).toMatch(/^Bearer [0-9a-f]{48}$/);
    expect(fs.readFileSync(flags[3], 'utf-8')).toContain('el espacio «Wiselink»');
    registry.forget('ses-sup');
    expect(fs.existsSync(flags[1])).toBe(false);
  });

  it('words the role and config', () => {
    expect(supervisorPrompt({ kind: 'all' })).toContain('todos los agentes');
    expect(supervisorPrompt({ kind: 'agents' })).toContain('Te toca:');
    expect(JSON.parse(mcpConfig('http://h/mcp', 't')).mcpServers.oficina.headers).toEqual({
      Authorization: 'Bearer t',
    });
  });
});

// ── A small office: two supervisors and three agents ─────────────────────

function add(store: AgentStateStore, id: number, over: Partial<AgentState> = {}): AgentState {
  const agent = createAgentState({
    id,
    sessionId: `s${id}`,
    projectDir: '/p',
    jsonlFile: `/p/s${id}.jsonl`,
    isExternal: false,
    cwd: CWD,
    nickname: `A${id}`,
    isWaiting: true,
    ...over,
  });
  store.set(id, agent);
  return agent;
}

function office(dir: string) {
  const store = new AgentStateStore();
  const registry = new SupervisorRegistry(new SupervisionTeams(path.join(dir, 'teams.json')), dir);
  registry.attach(store);
  add(store, 1);
  add(store, 2);
  add(store, 3, { nickname: 'Pagos' });
  add(store, 10, { nickname: 'Jefa', supervision: { kind: 'agents' }, officeTerminal: true });
  add(store, 11, { nickname: 'Todo', supervision: { kind: 'all' }, officeTerminal: true });
  registry.teams.set('s10', ['s1', 's3', 's10']);
  return { store, registry };
}

describe('SupervisorRegistry', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('knows each team: picked by hand, or everyone but supervisors', () => {
    const { store, registry } = office(dir);
    expect(registry.teamOf(store.get(10)!)).toEqual(['s1', 's3']);
    expect(registry.teamOf(store.get(11)!).sort()).toEqual(['s1', 's2', 's3']);
    expect(registry.supervisorsOf('s1').sort()).toEqual([10, 11]);
    expect(registry.supervisorsOf('s2')).toEqual([11]);
    expect(registry.supervisorsOf('s10')).toEqual([]);
  });

  it('finds a supervisor by its own token only', () => {
    const { registry } = office(dir);
    const flags = registry.prepareLaunch('s10', { kind: 'agents' });
    const token = JSON.parse(
      fs.readFileSync(flags[1], 'utf-8'),
    ).mcpServers.oficina.headers.Authorization.slice(7);
    expect(registry.supervisorByToken(token)).toBe(10);
    expect(registry.supervisorByToken('nope')).toBeUndefined();
    registry.prepareLaunch('s10', { kind: 'agents' });
    expect(registry.supervisorByToken(token)).toBeUndefined();
  });

  it('a supervisor born in the background keeps the token Claude started with', () => {
    const { registry } = office(dir);
    const flags = registry.prepareLaunch('provisorio', { kind: 'all' });
    const token = JSON.parse(
      fs.readFileSync(flags[1], 'utf-8'),
    ).mcpServers.oficina.headers.Authorization.slice(7);
    expect(registry.supervisorByToken(token)).toBeUndefined();
    registry.rebind('provisorio', 's11');
    expect(registry.supervisorByToken(token)).toBe(11);
  });

  it('takes the team the browser sends, and tells every office', () => {
    const { store, registry } = office(dir);
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
    expect(applySupervisionTeam(store, { supervisorId: 10, members: ['s2'] }, registry)).toBe(true);
    expect(registry.teamOf(store.get(10)!)).toEqual(['s2']);
    expect(sent.some((m) => m.type === 'agentIdentity')).toBe(true);
    expect(applySupervisionTeam(store, { supervisorId: 10, members: ['s2'] }, registry)).toBe(
      false,
    );
    expect(applySupervisionTeam(store, { supervisorId: 11, members: ['s2'] }, registry)).toBe(
      false,
    );
  });
});

describe('SupervisorRelay', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function relay() {
    const { store, registry } = office(dir);
    // A clock of its own: timers run in time order, like the real ones.
    let now = 0;
    const queue: Array<{ at: number; fn: () => void }> = [];
    const written = new Map<number, string>();
    const r = new SupervisorRelay({
      store,
      registry,
      terminalOf: (id) => ({ write: (d: string) => written.set(id, (written.get(id) ?? '') + d) }),
      schedule: (fn, ms) => queue.push({ at: now + ms, fn }),
      now: () => now,
    });
    const run = () => {
      while (queue.length) {
        queue.sort((a, b) => a.at - b.at);
        const next = queue.shift()!;
        now = next.at;
        next.fn();
      }
    };
    return { store, r, run, written };
  }

  it('gathers a permission and a finished turn into one message per supervisor', () => {
    const { store, r, run, written } = relay();
    r.observe({ type: 'agentStatus', id: 3, status: 'active' });
    r.observe({
      type: 'permissionPending',
      id: 3,
      requestId: 'p-1',
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
    });
    store.get(3)!.lastReply = 'Listo: tests en verde.';
    r.observe({ type: 'agentStatus', id: 3, status: 'waiting' });
    run(); // settle, then the batch
    run();
    const toJefa = written.get(10) ?? '';
    expect(toJefa).toContain('[Oficina] Novedades de tu equipo');
    expect(toJefa).toContain('«Pagos» pide permiso p-1 para: Bash `npm test`');
    expect(toJefa).toContain(
      // Line breaks reach the terminal as \r (sendToTerminal, like a paste).
      '«Pagos» terminó su turno. Lo último que dijo:\rListo: tests en verde.',
    );
    expect(written.get(11)).toContain('pide permiso p-1');
  });

  it('tells a finished turn once: waking up with the same answer is not news', () => {
    const { store, r, run, written } = relay();
    const turn = () => {
      r.observe({ type: 'agentStatus', id: 3, status: 'active' });
      r.observe({ type: 'agentStatus', id: 3, status: 'waiting' });
      run();
      run();
    };
    store.get(3)!.lastReply = 'Publiqué la 1.0.13.';
    turn();
    turn();
    turn();
    const told = (written.get(10) ?? '').split('terminó su turno').length - 1;
    expect(told).toBe(1);
    store.get(3)!.lastReply = 'Listo el chat.';
    turn();
    expect(written.get(10)).toContain('Listo el chat.');
  });

  it('does not report the first status it sees, nor agents outside the team', () => {
    const { r, run, written } = relay();
    r.observe({ type: 'agentStatus', id: 3, status: 'waiting' });
    r.observe({ type: 'agentStatus', id: 2, status: 'active' });
    r.observe({ type: 'agentStatus', id: 2, status: 'waiting' });
    run();
    run();
    expect(written.get(10)).toBeUndefined();
    expect(written.get(11)).toContain('«A2» terminó su turno.');
  });

  it('tells a question once, with its options when the hook has them', () => {
    const { r, run, written } = relay();
    r.observeHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'AskUserQuestion',
      session_id: 's1',
      tool_input: {
        questions: [{ question: '¿Qué base?', options: [{ label: 'dev' }, { label: 'prod' }] }],
      },
    });
    r.observe({ type: 'agentToolStart', id: 1, toolName: 'AskUserQuestion' });
    run();
    const text = written.get(10) ?? '';
    expect(text).toContain('«A1» pregunta y espera respuesta:\r¿Qué base? (1. dev · 2. prod)');
    expect(text.match(/pregunta/g)).toHaveLength(1);
  });

  it('words one piece of news without a list', () => {
    expect(relayText(['«A» terminó.'])).toBe('[Oficina] «A» terminó.');
  });
});

describe('SupervisorTools', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function tools() {
    const { store, registry } = office(dir);
    const pending: PendingPermission[] = [
      {
        requestId: 'p-ok',
        sessionId: 's3',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        cwd: CWD,
        createdAt: 1,
      },
      {
        requestId: 'p-push',
        sessionId: 's3',
        toolName: 'Bash',
        toolInput: { command: 'git push' },
        cwd: CWD,
        createdAt: 2,
      },
      {
        requestId: 'p-other',
        sessionId: 's2',
        toolName: 'Read',
        toolInput: {},
        cwd: CWD,
        createdAt: 3,
      },
    ];
    const decided: Array<[string, string]> = [];
    const written = new Map<number, string>();
    const broker = {
      pending: () => pending,
      decide: (id: string, d: { behavior: string }) => {
        decided.push([id, d.behavior]);
        return true;
      },
    };
    const deps = {
      store,
      registry,
      broker,
      terminalOf: (id: number) =>
        id === 3
          ? { write: (d: string) => written.set(id, (written.get(id) ?? '') + d) }
          : undefined,
    };
    return { t: new SupervisorTools(deps, 10), decided, written };
  }

  it('shows only its team, with what each one is waiting for', () => {
    const { t } = tools();
    const team = t.equipo();
    expect(team).toContain('«A1» (id 1)');
    expect(team).toContain('«Pagos» (id 3) · te necesita (permiso)');
    expect(team).toContain('permiso pendiente p-ok: Bash `npm test`');
    expect(team).not.toContain('A2');
  });

  it('approves the safe, sends the risky to Valentín, and stays inside its team', () => {
    const { t, decided } = tools();
    expect(t.aprobarPermiso('p-ok')).toContain('Aprobado');
    expect(t.aprobarPermiso('p-push')).toContain(VALENTIN_DECIDES);
    expect(t.aprobarPermiso('p-other')).toContain('no es de un agente de tu equipo');
    expect(t.rechazarPermiso('p-push', 'todavía no')).toContain('Rechazado');
    expect(decided).toEqual([
      ['p-ok', 'allow'],
      ['p-push', 'deny'],
    ]);
  });

  it('writes to its agents that have an office terminal', () => {
    const { t, written } = tools();
    expect(t.escribirAAgente('pagos', 'seguí con el PR')).toContain('Listo');
    expect(written.get(3)).toContain('[Supervisor «Jefa»] seguí con el PR');
    expect(t.escribirAAgente('A1', 'hola')).toContain('no tiene su terminal');
    expect(t.escribirAAgente('A2', 'hola')).toContain('no está en tu equipo');
  });
});
