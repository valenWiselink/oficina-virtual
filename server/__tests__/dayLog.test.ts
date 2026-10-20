import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { DayLog, localDay } from '../src/dayLog.js';
import { turnSummary } from '../src/turnSummary.js';
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

  function setup(start = new Date(2026, 9, 19, 10, 0).getTime(), settleMs = 0) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daylog-'));
    dirs.push(dir);
    let now = start;
    const store = new AgentStateStore();
    store.set(1, { id: 1, nickname: 'Pagos' } as AgentState);
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));
    const log = new DayLog(store, dir, () => now, settleMs);
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

  it('a finished turn says what it did: its answer and the files it edited', () => {
    vi.useFakeTimers();
    try {
      const { log, store, tick } = setup(undefined, 3000);
      const chat = (items: object[]) => store.broadcast({ type: 'agentChatAppend', id: 1, items });
      store.broadcast(identity());
      store.broadcast({ type: 'agentStatus', id: 1, status: 'active' });
      chat([
        { role: 'tool', text: 'Leyó dayLog.ts' },
        { role: 'tool', text: 'Editó dayLog.ts' },
        { role: 'tool', text: 'Escribió turnSummary.ts' },
      ]);
      // The Stop hook is instant; the answer's transcript line comes after.
      store.broadcast({ type: 'agentStatus', id: 1, status: 'waiting' });
      tick(800);
      chat([
        {
          role: 'assistant',
          text: 'Arreglé el historial: ahora dice qué hizo.\n\nTe toca: probarlo',
        },
      ]);
      expect(log.today()).toEqual([]);
      vi.advanceTimersByTime(3000);
      const [turn] = log.today();
      expect(turn.summary).toBe('Arreglé el historial: ahora dice qué hizo.');
      expect(turn.edits).toBe(2);
      expect(turn.at).toBe(new Date(2026, 9, 19, 10, 0).getTime());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('turnSummary', () => {
  it('keeps the first sentences of the answer, without markdown, links or "Te toca"', () => {
    const answer = [
      'Publiqué la **1.0.5** con los dos arreglos: https://github.com/x/releases/tag/v1.0.5',
      '',
      '**Los agentes** que se metieron en `Desarrollo`',
      '- Qué pasaba: una regla.',
      '',
      'Te toca: instalarla',
    ].join('\n');
    expect(turnSummary(answer)).toBe('Publiqué la 1.0.5 con los dos arreglos.');
    expect(turnSummary('## Listo\n\nCambié [el README](README.md) y los tests.')).toBe(
      'Listo. Cambié el README y los tests.',
    );
    expect(turnSummary('Te toca: mergear el PR')).toBeUndefined();
    expect(turnSummary('```ts\nconst a = 1;\n```')).toBeUndefined();
  });

  it('stops at two sentences or a long one', () => {
    const long = 'Encontré la causa del problema en el parser. Ya lo arreglé con un test. Tres.';
    expect(turnSummary(long)).toBe(
      'Encontré la causa del problema en el parser. Ya lo arreglé con un test.',
    );
    expect(turnSummary('a'.repeat(300))?.length).toBe(240);
  });
});
