import { describe, expect, it } from 'vitest';

import type { PrState, PrStatus } from '../../core/src/messages.js';
import { classifyGhError, type GhAnswer, parseGhView, PrWatch } from '../src/prWatch.js';

const A = 'https://github.com/acme/web/pull/1';
const B = 'https://github.com/acme/api/pull/2';

function setup(answers: Record<string, GhAnswer[]>, urls: string[]) {
  const asked: string[] = [];
  const changes: Array<{ status: PrStatus; previous?: PrState }> = [];
  const logs: string[] = [];
  const watch = new PrWatch({
    collect: () => urls,
    onStatus: (status, previous) => changes.push({ status, previous }),
    run: async (url) => {
      asked.push(url);
      return answers[url]?.shift() ?? { ok: false, fatal: false, reason: 'no answer' };
    },
    log: (l) => logs.push(l),
  });
  return { watch, asked, changes, logs };
}

describe('parseGhView / classifyGhError', () => {
  it('reads gh JSON states', () => {
    expect(
      parseGhView('{"state":"MERGED","title":"Fix","mergedAt":"2026-10-19T10:00:00Z"}'),
    ).toEqual({ ok: true, state: 'merged', title: 'Fix', mergedAt: '2026-10-19T10:00:00Z' });
    expect(parseGhView('{"state":"OPEN","mergedAt":""}')).toEqual({
      ok: true,
      state: 'open',
      title: undefined,
      mergedAt: undefined,
    });
    expect(parseGhView('nope').ok).toBe(false);
  });

  it('treats a missing or logged-out gh as fatal, the rest per URL', () => {
    expect(classifyGhError('ENOENT', '')).toMatchObject({ fatal: true });
    expect(
      classifyGhError(1, 'To get started with GitHub CLI, please run:  gh auth login'),
    ).toMatchObject({
      fatal: true,
    });
    expect(classifyGhError(1, 'Could not resolve to a PullRequest')).toMatchObject({
      fatal: false,
    });
  });
});

describe('PrWatch', () => {
  it('reports first sight and changes, then stops asking once merged', async () => {
    const { watch, asked, changes } = setup(
      {
        [A]: [
          { ok: true, state: 'open' },
          { ok: true, state: 'merged', title: 'Fix' },
        ],
      },
      [A, A],
    );
    await watch.tick();
    await watch.tick();
    await watch.tick();
    expect(asked).toEqual([A, A]);
    expect(changes.map((c) => [c.status.state, c.previous])).toEqual([
      ['open', undefined],
      ['merged', 'open'],
    ]);
    expect(watch.all()).toEqual([{ url: A, state: 'merged', title: 'Fix' }]);
  });

  it('ignores anything that is not a GitHub PR URL', async () => {
    const { watch, asked } = setup({}, [
      'https://evil.example/pull/1',
      'https://github.com/a/b/pull/1;rm -rf',
    ]);
    await watch.tick();
    expect(asked).toEqual([]);
  });

  it('gives up quietly, once, when gh is missing', async () => {
    const { watch, asked, logs } = setup(
      { [A]: [{ ok: false, fatal: true, reason: 'gh is not installed' }] },
      [A, B],
    );
    await watch.tick();
    await watch.tick();
    expect(logs).toHaveLength(1);
    expect(asked.length).toBeLessThanOrEqual(2);
    const before = asked.length;
    await watch.tick();
    expect(asked.length).toBe(before);
  });

  it('drops a URL that keeps failing', async () => {
    const { watch, asked } = setup({}, [B]);
    for (let i = 0; i < 7; i++) await watch.tick();
    expect(asked).toHaveLength(5);
  });
});
