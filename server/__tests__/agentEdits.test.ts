import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanEffort,
  cleanModel,
  editAgent,
  parseEdit,
  runFlags,
  setAgentRun,
} from '../src/agentEdits.js';
import { AgentLooks, applySavedLook } from '../src/agentLooks.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { claudeProvider } from '../src/providers/index.js';
import { ResumableSessions } from '../src/terminal/resumableSessions.js';
import type { LaunchStandaloneAgentDeps } from '../src/terminal/standaloneAgentLauncher.js';
import type { AgentState } from '../src/types.js';

function agent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'ses-1',
    isExternal: true,
    projectDir: '/p',
    jsonlFile: '/p/ses-1.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 200_000,
    palette: 1,
    hueShift: 40,
    ...overrides,
  } as AgentState;
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-edits-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('model and effort', () => {
  it('takes the aliases, full ids and the five levels, nothing else', () => {
    expect(cleanModel('Opus')).toBe('opus');
    expect(cleanModel('claude-opus-5-5[1m]')).toBe('claude-opus-5-5[1m]');
    expect(cleanModel('gpt-5')).toBeUndefined();
    expect(cleanModel('opus; rm -rf')).toBeUndefined();
    expect(cleanEffort('xhigh')).toBe('xhigh');
    expect(cleanEffort('ultracode')).toBeUndefined();
    expect(runFlags('sonnet', 'high')).toEqual(['--model', 'sonnet', '--effort', 'high']);
    expect(runFlags(undefined, 'bogus')).toEqual([]);
  });

  it('puts the flags on the launch and on a resume', () => {
    const fresh = claudeProvider.buildLaunchCommand!('s', 'C:/r', {
      model: 'haiku',
      effort: 'low',
    });
    expect(fresh.args).toEqual(['--session-id', 's', '--model', 'haiku', '--effort', 'low']);
    const back = claudeProvider.buildLaunchCommand!('s', 'C:/r', { resume: true, model: 'opus' });
    expect(back.args).toEqual(['--resume', 's', '--model', 'opus']);
  });
});

describe('editAgent', () => {
  it('validates the name and colour it is given', () => {
    expect(parseEdit({ nickname: '  Pagos  ', palette: 2 })).toEqual({
      nickname: 'Pagos',
      palette: 2,
    });
    expect(parseEdit({ palette: 99 })).toEqual({});
    expect(parseEdit({ nickname: 'x'.repeat(50) }).nickname).toHaveLength(32);
  });

  it('renames and recolours an outside agent, keeps it and tells every office', () => {
    const store = new AgentStateStore();
    const sent: Record<string, unknown>[] = [];
    store.on('broadcast', (m) => sent.push(m));
    store.set(1, agent());
    const looks = new AgentLooks(path.join(dir, 'looks.json'));
    expect(editAgent(store, undefined, 1, { nickname: 'Docs', palette: 3 }, looks)).toBe(true);
    expect(store.get(1)).toMatchObject({ nickname: 'Docs', palette: 3, hueShift: 0 });
    expect(looks.get('ses-1')).toEqual({ nickname: 'Docs', palette: 3, hueShift: 0 });
    expect(sent.map((m) => m.type)).toEqual(['agentIdentity', 'agentAppearance']);
    expect(sent[1]).toEqual({ type: 'agentAppearance', id: 1, palette: 3, hueShift: 0 });
  });

  it('clears the name with an empty one, and the saved look comes back on a new copy', () => {
    const store = new AgentStateStore();
    store.set(1, agent({ nickname: 'Viejo' }));
    const looks = new AgentLooks(path.join(dir, 'looks.json'));
    editAgent(store, undefined, 1, { nickname: '' }, looks);
    expect(store.get(1)?.nickname).toBeUndefined();
    editAgent(store, undefined, 1, { palette: 4 }, looks);
    const reborn = agent({ nickname: 'Viejo', palette: undefined });
    applySavedLook(reborn, looks.get('ses-1'));
    expect(reborn).toMatchObject({ nickname: undefined, palette: 4, hueShift: 0 });
  });

  it("keeps an office terminal's look in its resumable session instead", () => {
    const store = new AgentStateStore();
    store.set(1, agent({ isExternal: false }));
    const resumable = new ResumableSessions(path.join(dir, 'sesiones.json'));
    resumable.add({ sessionId: 'ses-1', cwd: 'C:/r', model: 'opus' });
    const looks = new AgentLooks(path.join(dir, 'looks.json'));
    editAgent(store, resumable, 1, { nickname: 'Pagos' }, looks);
    expect(resumable.list()[0]).toMatchObject({ nickname: 'Pagos', model: 'opus' });
    expect(looks.get('ses-1')).toBeUndefined();
  });

  it('does nothing for an unknown agent or an empty change', () => {
    const store = new AgentStateStore();
    store.set(1, agent());
    const looks = new AgentLooks(path.join(dir, 'looks.json'));
    expect(editAgent(store, undefined, 2, { nickname: 'x' }, looks)).toBe(false);
    expect(editAgent(store, undefined, 1, {}, looks)).toBe(false);
  });
});

describe('setAgentRun refusals', () => {
  const deps = (a: AgentState, hasTerminal: boolean): LaunchStandaloneAgentDeps => {
    const store = new AgentStateStore();
    store.set(a.id, a);
    return {
      store,
      runtime: {} as LaunchStandaloneAgentDeps['runtime'],
      ptyManager: {
        get: () => (hasTerminal ? {} : undefined),
      } as unknown as LaunchStandaloneAgentDeps['ptyManager'],
      provider: {} as LaunchStandaloneAgentDeps['provider'],
    };
  };

  it('refuses outside agents and unknown models', async () => {
    await expect(
      setAgentRun(deps(agent(), false), 1, { model: 'opus' }, false),
    ).resolves.toMatchObject({
      ok: false,
      reason: expect.stringContaining('terminal de la oficina'),
    });
    await expect(
      setAgentRun(deps(agent(), true), 1, { model: 'gpt' }, false),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'Ese modelo no existe',
    });
    await expect(
      setAgentRun(deps(agent(), true), 1, { effort: 'ultra' }, false),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'Ese nivel de esfuerzo no existe',
    });
  });

  it('mid-turn, keeps the change for when its turn ends', async () => {
    vi.useFakeTimers();
    try {
      const busy = agent({ activeToolIds: new Set(['t1']) });
      const d = deps(busy, true);
      await expect(setAgentRun(d, 1, { model: 'sonnet' }, false)).resolves.toEqual({
        ok: true,
        queued: true,
      });
      // The agent goes away before its turn ends: the wait gives up quietly.
      d.store.delete(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
