import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { DayLog, localDay } from '../src/dayLog.js';
import type { AgentState } from '../src/types.js';

const identity = (over: Record<string, unknown> = {}) => ({
  type: 'agentIdentity',
  id: 1,
  nickname: 'Pagos',
  tasks: [],
  ...over,
});

describe('DayLog', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function setup(start = new Date(2026, 9, 19, 10, 0).getTime()) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daylog-'));
    dirs.push(dir);
    let now = start;
    const store = new AgentStateStore();
    store.set(1, { id: 1, nickname: 'Pagos' } as AgentState);
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
    const log = new DayLog(store, dir, () => now);
    log.start();
    return { log, store, dir, sent, tick: (ms: number) => (now += ms) };
  }

  it('what already existed at first sight is not news', () => {
    const { log, store } = setup();
    store.broadcast(
      identity({
        yourTurnId: 'u1',
        yourTurn: 'mergear',
        tasks: [{ id: '1', subject: 'A', status: 'completed' }],
      }),
    );
    store.broadcast({ type: 'agentStatus', id: 1, status: 'waiting' });
    expect(log.today()).toEqual([]);
  });

  it('logs a permission with how long it waited, a finished turn, "te toca" and tasks', () => {
    const { log, store, tick } = setup();
    store.broadcast(identity());
    store.broadcast({ type: 'agentStatus', id: 1, status: 'active' });
    store.broadcast({ type: 'permissionPending', requestId: 'r', id: 1, toolName: 'Bash' });
    tick(90_000);
    store.broadcast({ type: 'permissionResolved', requestId: 'r', id: 1, outcome: 'allow' });
    store.broadcast({ type: 'agentStatus', id: 1, status: 'waiting' });
    store.broadcast(
      identity({
        yourTurnId: 'u2',
        yourTurn: 'revisar el PR #77',
        yourTurnUrl: 'https://github.com/w/web/pull/77',
        tasks: [{ id: '1', subject: 'Armar el endpoint', status: 'completed' }],
      }),
    );
    const today = log.today();
    expect(today.map((e) => [e.kind, e.text])).toEqual([
      ['permiso', 'Pidió permiso (Bash)'],
      ['respuesta', 'Aprobaste su permiso'],
      ['termino', 'Terminó su turno'],
      ['tetoca', 'Te toca: revisar el PR #77'],
      ['tarea', 'Completó: Armar el endpoint'],
    ]);
    expect(today[1].waitedMs).toBe(90_000);
    expect(today[3].prUrl).toBe('https://github.com/w/web/pull/77');
    expect(today.every((e) => e.agent === 'Pagos')).toBe(true);
  });

  it('records the folder the agent works in, for telling the day by project', () => {
    const { log, store } = setup();
    store.set(1, {
      id: 1,
      nickname: 'Pagos',
      cwd: path.join(os.tmpdir(), 'wiselink', 'api'),
    } as AgentState);
    store.broadcast(identity());
    store.broadcast({ type: 'agentStatus', id: 1, status: 'active' });
    store.broadcast({ type: 'agentStatus', id: 1, status: 'waiting' });
    expect(log.today().map((e) => e.folder)).toEqual(['api']);
  });

  it('survives a restart through its file, and a new day starts empty', () => {
    const start = new Date(2026, 9, 19, 23, 50).getTime();
    const { store, dir, tick } = setup(start);
    store.broadcast({ type: 'agentClosed', id: 1 });
    const again = new DayLog(new AgentStateStore(), dir, () => start + 1000);
    expect(again.today().map((e) => e.text)).toEqual(['Se cerró']);
    expect(fs.existsSync(path.join(dir, `historial-${localDay(start)}.jsonl`))).toBe(true);
    tick(20 * 60_000);
    const nextDay = new DayLog(new AgentStateStore(), dir, () => start + 20 * 60_000);
    expect(nextDay.today()).toEqual([]);
  });

  it('a restart that reads the transcript late does not log the same "te toca" again', () => {
    const { store, dir } = setup();
    store.broadcast(identity());
    store.broadcast(identity({ yourTurnId: 'u1', yourTurn: 'revisar el PR #77' }));
    // Restarted: first sight has no turn yet, then the transcript brings it.
    const store2 = new AgentStateStore();
    store2.set(1, { id: 1, nickname: 'Pagos' } as AgentState);
    const again = new DayLog(store2, dir, () => new Date(2026, 9, 19, 10, 5).getTime());
    again.start();
    store2.broadcast(identity());
    store2.broadcast(identity({ yourTurnId: 'u1', yourTurn: 'revisar el PR #77' }));
    expect(again.today().filter((e) => e.kind === 'tetoca')).toHaveLength(1);
  });

  it('warns once when the context crosses 90%', () => {
    const { log, store } = setup();
    const usage = (n: number) => ({
      type: 'agentContextUsage',
      id: 1,
      contextTokens: n,
      maxContextTokens: 100,
    });
    store.broadcast(usage(91));
    store.broadcast(usage(95));
    store.broadcast(usage(10));
    store.broadcast(usage(92));
    expect(log.today().filter((e) => e.kind === 'contexto')).toHaveLength(2);
  });
});
