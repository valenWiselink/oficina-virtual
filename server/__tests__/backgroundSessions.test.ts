import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { HookProvider } from '../../core/src/provider.js';
import { setAgentRun } from '../src/agentEdits.js';
import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { spinnerSettingsPath } from '../src/spinnerSettings.js';
import {
  backgroundArgs,
  backgroundName,
  type BackgroundRow,
  isUntrusted,
  parseBackgrounded,
  parseRows,
  setBackgroundAgents,
  setBackgroundRunner,
} from '../src/terminal/backgroundSessions.js';
import type { IPty, PtyModule, PtySpawnOptions } from '../src/terminal/ptyModule.js';
import { PtySessionManager } from '../src/terminal/ptySessionManager.js';
import { ResumableSessions } from '../src/terminal/resumableSessions.js';
import { launchAgent } from '../src/terminal/standaloneAgentLauncher.js';

/**
 * Agents as Claude Code background sessions (backgroundSessions.ts): the
 * pure helpers, and launchAgent's choices driven with a fake `claude` and a
 * fake PTY — the real thing was measured by hand (see the module's header).
 */

describe('background session helpers', () => {
  it('reads the short id claude --bg prints', () => {
    const out = 'backgrounded · 4d1e47e7 · oficina-pagos-3f2a (idle — send a prompt to start)\n';
    expect(parseBackgrounded(out)).toBe('4d1e47e7');
    expect(parseBackgrounded('Starting background service…')).toBeUndefined();
  });

  it('tells an untrusted folder', () => {
    expect(isUntrusted('Workspace not trusted. Run `claude` in F:\\x once')).toBe(true);
    expect(isUntrusted('backgrounded · 4d1e47e7')).toBe(false);
  });

  it('names sessions readably and uniquely', () => {
    expect(backgroundName('Pagos Ñandú', () => 0.5)).toBe('oficina-pagos-nandu-8000');
    expect(backgroundName('!!!', () => 0)).toBe('oficina-agente-0000');
  });

  it('turns launch arguments into background ones', () => {
    expect(backgroundArgs(['--session-id', 'S', '--model', 'opus', 'hola'], 'n')).toEqual([
      '--bg',
      '--name',
      'n',
      '--model',
      'opus',
      'hola',
    ]);
    expect(backgroundArgs(['--resume', 'S', '--effort', 'high'], 'n')).toEqual([
      '--resume',
      'S',
      '--bg',
      '--name',
      'n',
      '--effort',
      'high',
    ]);
  });

  it('parses the listing, skipping anything that is not a row', () => {
    const rows = parseRows('noise\n[{"id":"a1","sessionId":"s","kind":"background"},{"x":1}]');
    expect(rows).toEqual([{ id: 'a1', sessionId: 's', kind: 'background' }]);
    expect(parseRows('not json')).toEqual([]);
  });
});

class FakePty implements IPty {
  readonly pid = 77;
  private exitListener: ((e: { exitCode: number }) => void) | null = null;
  onData(): void {}
  onExit(listener: (e: { exitCode: number }) => void): void {
    this.exitListener = listener;
  }
  write(): void {}
  resize(): void {}
  kill(): void {
    this.exit(0);
  }
  exit(code = 0): void {
    this.exitListener?.({ exitCode: code });
  }
}

describe('launchAgent with background sessions', () => {
  let tempDir: string;
  let projectDir: string;
  let cwd: string;
  let store: AgentStateStore;
  let runtime: AgentRuntime;
  let spawned: Array<{ file: string; args: string[]; options: PtySpawnOptions; pty: FakePty }>;
  let manager: PtySessionManager;
  let calls: string[][];
  let rows: BackgroundRow[];

  const SID = '4d1e47e7-b368-40e3-9d8c-e99e17bb907c';
  const provider = (): HookProvider => ({
    ...claudeProvider,
    getSessionDirs: () => [projectDir],
  });
  const deps = () => ({ store, runtime, ptyManager: manager, provider: provider() });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-bg-test-'));
    projectDir = path.join(tempDir, 'sessions');
    cwd = path.join(tempDir, 'proyecto');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(cwd, { recursive: true });
    store = new AgentStateStore();
    runtime = new AgentRuntime(store, claudeProvider);
    runtime.resumableSessions = new ResumableSessions(path.join(tempDir, 'sesiones.json'));
    spawned = [];
    const module: PtyModule = {
      spawn: (file, args, options) => {
        const pty = new FakePty();
        spawned.push({ file, args, options, pty });
        return pty;
      },
    };
    manager = new PtySessionManager(() => ({ module, moduleId: 'fake', reason: null }));
    calls = [];
    rows = [];
    setBackgroundAgents(true);
    setBackgroundRunner(async (args, where) => {
      calls.push(args);
      if (args[0] === 'agents') return { code: 0, out: JSON.stringify(rows) };
      if (args[0] === 'stop' || args[0] === 'rm') return { code: 0, out: `${args[0]} ${args[1]}` };
      if (args.includes('--bg')) {
        if (where.includes('sin-confianza')) {
          return { code: 1, out: 'Workspace not trusted. Run `claude` in it once' };
        }
        const resumed = args[0] === '--resume' ? args[1] : SID;
        rows.push({
          id: resumed.slice(0, 8),
          sessionId: resumed,
          kind: 'background',
          state: 'blocked',
        });
        return { code: 0, out: `backgrounded · ${resumed.slice(0, 8)} · x (idle)` };
      }
      return { code: 1, out: 'unexpected' };
    });
  });

  afterEach(() => {
    setBackgroundRunner(null);
    setBackgroundAgents(false);
    runtime.dispose();
    store.dispose();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('starts a background session and attaches the terminal to it', async () => {
    const id = await launchAgent(deps(), { directoryPath: cwd, nickname: 'Pagos', model: 'opus' });
    expect(id).toBe(1);
    const start = calls.find((c) => c.includes('--bg'))!;
    expect(start.slice(0, 2)).toEqual(['--bg', '--name']);
    expect(start[2]).toMatch(/^oficina-pagos-[0-9a-f]{4}$/);
    expect(start).toContain('opus');
    expect(start).not.toContain('--session-id');
    expect(start).toContain('--settings');
    expect(spawned[0].args.slice(-2)).toEqual(['attach', '4d1e47e7']);
    const agent = store.get(1)!;
    expect(agent.sessionId).toBe(SID);
    expect(agent.bgId).toBe('4d1e47e7');
    expect(runtime.resumableSessions!.list()[0]).toMatchObject({
      sessionId: SID,
      bgId: '4d1e47e7',
    });
  });

  it('launches the regular way in an untrusted folder, or with the mode off', async () => {
    const untrusted = path.join(tempDir, 'sin-confianza');
    fs.mkdirSync(untrusted);
    await launchAgent(deps(), { directoryPath: untrusted });
    expect(spawned[0].args).toContain('--session-id');
    expect(store.get(1)!.bgId).toBeUndefined();

    setBackgroundAgents(false);
    await launchAgent(deps(), { directoryPath: cwd });
    expect(spawned[1].args).toContain('--session-id');
    expect(calls.filter((c) => c.includes('--bg'))).toHaveLength(1);
  });

  it('attaches again to a session still running after the office restarts', async () => {
    rows.push({ id: '4d1e47e7', sessionId: SID, kind: 'background', state: 'done' });
    const id = await launchAgent(deps(), {
      resume: { sessionId: SID, cwd, bgId: '4d1e47e7', bgName: 'oficina-x' },
    });
    expect(id).toBe(1);
    expect(calls.some((c) => c.includes('--bg'))).toBe(false);
    expect(spawned[0].args.slice(-2)).toEqual(['attach', '4d1e47e7']);
  });

  it('turns a regular session into a background one under the same id', async () => {
    await launchAgent(deps(), { resume: { sessionId: SID, cwd, model: 'sonnet' } });
    const start = calls.find((c) => c.includes('--bg'))!;
    expect(start.slice(0, 3)).toEqual(['--resume', SID, '--bg']);
    expect(start).toContain('sonnet');
    // Claude Code carries --settings into the background session and keeps it
    // across the supervisor's restarts (docs: agent-view, "What carries over").
    expect(start.slice(start.indexOf('--settings'), start.indexOf('--settings') + 2)).toEqual([
      '--settings',
      spinnerSettingsPath(),
    ]);
    expect(store.get(1)!.bgId).toBe('4d1e47e7');
  });

  it('keeps the session when the office shuts down, and re-attaches after a detach', async () => {
    await launchAgent(deps(), { directoryPath: cwd });
    // Detached (or the attach died) with the office running: shown again.
    spawned[0].pty.exit(0);
    expect(store.has(1)).toBe(false);
    await wait(1500);
    expect(spawned).toHaveLength(2);
    expect(spawned[1].args.slice(-2)).toEqual(['attach', '4d1e47e7']);
    expect(runtime.resumableSessions!.list()).toHaveLength(1);

    // The office shutting down: the attach dies, the session stays resumable.
    runtime.resumableSessions!.freeze();
    spawned[1].pty.exit(0);
    await wait(1200);
    expect(spawned).toHaveLength(2);
    expect(runtime.resumableSessions!.list()).toHaveLength(1);
  });

  it('lets a closed agent go: no re-attach, off the resumable list', async () => {
    await launchAgent(deps(), { directoryPath: cwd });
    store.get(1)!.bgLeaving = true;
    spawned[0].pty.exit(0);
    await wait(1200);
    expect(spawned).toHaveLength(1);
    expect(runtime.resumableSessions!.list()).toHaveLength(0);
  });

  it('changes the model by stopping, removing and resuming under the same id', async () => {
    await launchAgent(deps(), { directoryPath: cwd, model: 'sonnet' });
    fs.writeFileSync(path.join(projectDir, `${SID}.jsonl`), '{}\n');
    rows.splice(0, rows.length, {
      id: '4d1e47e7',
      sessionId: SID,
      kind: 'background',
      state: 'done',
    });
    const result = await setAgentRun(deps(), 1, { model: 'haiku' }, false);
    expect(result).toMatchObject({ ok: true });
    const order = calls.map((c) => c[0]);
    expect(order.indexOf('stop')).toBeLessThan(order.indexOf('rm'));
    const resumed = calls.filter((c) => c.includes('--bg')).pop()!;
    expect(resumed.slice(0, 3)).toEqual(['--resume', SID, '--bg']);
    expect(resumed).toContain('haiku');
    const now = [...store.values()].find((a) => a.sessionId === SID)!;
    expect(now.bgId).toBe('4d1e47e7');
    expect(now.runModel).toBe('haiku');
  });
});
