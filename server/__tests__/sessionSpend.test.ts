import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  mergeTallies,
  newTally,
  seedSessionSpend,
  spendOf,
  tallyRecord,
} from '../src/sessionSpend.js';

/** One record of an assistant message, as Claude Code writes it (one per content block). */
function record(
  id: string,
  usage: { input?: number; read?: number; write?: number; output?: number },
  opts: { model?: string; sidechain?: boolean } = {},
) {
  return {
    type: 'assistant',
    isSidechain: opts.sidechain ?? false,
    requestId: `req_${id}`,
    message: {
      id: `msg_${id}`,
      model: opts.model ?? 'claude-opus-5-5',
      usage: {
        input_tokens: usage.input ?? 0,
        cache_read_input_tokens: usage.read ?? 0,
        cache_creation_input_tokens: usage.write ?? 0,
        output_tokens: usage.output ?? 0,
      },
    },
  };
}

describe('session spend', () => {
  it('sums the four counters once per request, not once per record', () => {
    const tally = newTally();
    const a = record('a', { input: 2, read: 1000, write: 300, output: 50 });
    tallyRecord(tally, a);
    tallyRecord(tally, a); // the same message's next content block
    tallyRecord(tally, record('b', { input: 1, read: 1300, output: 20 }));
    expect(tally.spend).toEqual({ input: 3, cacheRead: 2300, cacheWrite: 300, output: 70 });
  });

  it('ignores records without usage and synthetic all-zero ones', () => {
    expect(spendOf({ type: 'user', message: { content: 'hola' } })).toBeNull();
    expect(spendOf(record('z', {}, { model: '<synthetic>' }))).toBeNull();
    const tally = newTally();
    expect(tallyRecord(tally, record('z', {}, { model: '<synthetic>' }))).toBe(false);
    expect(tally.model).toBeUndefined();
  });

  it('names the newest main-chain model; sub-agents do not replace it', () => {
    const tally = newTally();
    tallyRecord(tally, record('a', { output: 1 }, { model: 'claude-opus-5-5' }));
    tallyRecord(tally, record('b', { output: 1 }, { model: 'claude-haiku-5-5', sidechain: true }));
    expect(tally.model).toBe('claude-opus-5-5');
    tallyRecord(tally, record('c', { output: 1 }, { model: 'claude-sonnet-5-5' }));
    expect(tally.model).toBe('claude-sonnet-5-5');
  });

  it('takes the model from sidechain records when that is all there is (a teammate)', () => {
    const tally = newTally();
    tallyRecord(tally, record('a', { output: 1 }, { model: 'claude-haiku-5-5', sidechain: true }));
    expect(tally.model).toBe('claude-haiku-5-5');
  });

  it('counts a message split by the stream start only once when merging', () => {
    const before = newTally();
    tallyRecord(before, record('a', { read: 100 }));
    tallyRecord(before, record('b', { read: 200, output: 5 }));
    const after = newTally();
    tallyRecord(after, record('b', { read: 200, output: 5 })); // b's second block
    tallyRecord(after, record('c', { read: 300 }));
    const merged = mergeTallies(before, after);
    expect(merged.spend).toEqual({ input: 0, cacheRead: 600, cacheWrite: 0, output: 5 });
  });
});

describe('seedSessionSpend', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('reads the transcript up to the stream start in the background and adds it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spend-'));
    dirs.push(dir);
    const file = path.join(dir, 's.jsonl');
    const lines = [record('a', { read: 100, output: 1 }), record('b', { read: 200, output: 2 })]
      .map((r) => JSON.stringify(r))
      .join('\n');
    fs.writeFileSync(file, `${lines}\n`);
    const agent = { jsonlFile: file, fileOffset: fs.statSync(file).size } as never as Record<
      string,
      unknown
    >;
    const live = newTally();
    tallyRecord(live, record('c', { read: 300, output: 3 }));
    agent.spendTally = live;
    const store = { get: () => agent } as never;
    let done = 0;
    await seedSessionSpend(1, store, () => done++);
    await seedSessionSpend(1, store, () => done++); // same file again: no double count
    expect(done).toBe(1);
    expect((agent.spendTally as typeof live).spend).toEqual({
      input: 0,
      cacheRead: 600,
      cacheWrite: 0,
      output: 6,
    });
  });
});
