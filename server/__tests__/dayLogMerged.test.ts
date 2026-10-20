import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { DayLog } from '../src/dayLog.js';
import type { AgentState } from '../src/types.js';

const URL = 'https://github.com/acme/web/pull/7';

describe('DayLog merges', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('credits a merged PR to whoever left it today', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daylog-merge-'));
    dirs.push(dir);
    let now = new Date(2026, 9, 19, 10).getTime();
    const store = new AgentStateStore();
    store.set(1, { id: 1, nickname: 'Pagos' } as AgentState);
    const log = new DayLog(store, dir, () => now);
    log.start();
    const identity = (over: Record<string, unknown>) =>
      store.broadcast({ type: 'agentIdentity', id: 1, nickname: 'Pagos', tasks: [], ...over });
    identity({});
    identity({ yourTurnId: 't1', yourTurn: 'revisá el PR', yourTurnUrl: URL });
    expect(log.prUrls()).toEqual([URL]);
    store.delete(1);
    now += 60_000;
    log.prMerged(URL, 'Arregla pagos');
    const last = log.today().at(-1)!;
    expect(last).toMatchObject({ kind: 'mergeado', agentId: 1, agent: 'Pagos', prUrl: URL });
    expect(last.text).toBe('Se mergeó: Arregla pagos');
  });
});
