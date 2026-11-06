/* eslint-disable pixel-agents/no-inline-colors -- «#2752» is a PR number, not a colour */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setPrStates } from '../src/mergedAsk.js';
import { AskMerger } from '../src/pendingAsks/askMerger.js';
import { mergeTargetOf } from '../src/pendingAsks/mergeTarget.js';
import { clockAt, PendingAsks } from '../src/pendingAsks/pendingAsks.js';

const WEBAPP = 'https://github.com/Wiselink/wiselink_frontend_webapp/pull/2752';

describe('the PR a «Mergear» button merges', () => {
  it('the command Jarvis left (6/11): its repo, method and head guard, nothing else', () => {
    expect(
      mergeTargetOf({
        text: 'mergear el PR #2752 de la webapp a main',
        command:
          'gh pr merge 2752 --repo Wiselink/wiselink_frontend_webapp --squash --match-head-commit 9bd1816 --admin',
      }),
    ).toEqual({ url: WEBAPP, args: ['--squash', '--match-head-commit', '9bd1816'] });
  });

  it('a merge ask with one PR link, merged with a merge commit', () => {
    expect(mergeTargetOf({ text: 'mergear y avisarme', prUrls: [WEBAPP] })).toEqual({
      url: WEBAPP,
      args: ['--merge'],
    });
    expect(
      mergeTargetOf({
        text: 'correr `gh pr merge #2752`',
        command: 'gh pr merge #2752',
        prUrls: [WEBAPP],
      }),
    ).toEqual({ url: WEBAPP, args: ['--merge'] });
  });

  it.each([
    ['not a merge', { text: 'revisar el PR', prUrls: [WEBAPP] }],
    ['two PRs, no command to choose', { text: 'mergear los dos', prUrls: [WEBAPP, `${WEBAPP}0`] }],
    ['a number with no repo known', { text: 'mergear', command: 'gh pr merge 12' }],
    ['spoken, no link', { text: 'mergear el PR treinta' }],
    ['another command', { text: 'mergear', command: 'git merge main' }],
    ['a repo that is not one', { text: 'x', command: 'gh pr merge 1 --repo ../../etc' }],
  ])('none when %s', (_why, ask) => {
    expect(mergeTargetOf(ask)).toBeUndefined();
  });
});

describe('«HH:MM» from dejar_pendiente', () => {
  const day = (h: number, m = 0, d = 6) => new Date(2026, 10, d, h, m).getTime();

  it('is today at that time; tomorrow when today’s has long passed', () => {
    expect(clockAt('23:00', day(14, 18))).toBe(day(23));
    expect(clockAt('14:45', day(14))).toBe(day(14, 45));
    expect(clockAt('9', day(8))).toBe(day(9));
    expect(clockAt('09:00', day(23, 30))).toBe(day(9, 0, 7));
  });

  it.each(['25:00', '14:75', 'a las tres', ''])('«%s» is not one', (hhmm) => {
    expect(clockAt(hhmm, day(14))).toBeNull();
  });
});

describe('merging from the office', () => {
  let dir: string;
  let states: Map<string, string>;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-merge-'));
    states = new Map();
    setPrStates((url) => states.get(url) as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setPrStates(() => undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const setup = (ok = true) => {
    const asks = new PendingAsks({ broadcast: () => undefined, file: path.join(dir, 'p.json') });
    const told: string[] = [];
    const runs: Array<[string, string[]]> = [];
    const merger = new AskMerger({
      asks: () => asks,
      tellJarvis: (t) => told.push(t),
      run: async (url, args) => {
        runs.push([url, args]);
        return ok
          ? { ok: true, output: '✓ Merged pull request #2752' }
          : {
              ok: false,
              output:
                'X Pull request is not mergeable: the base branch policy prohibits the merge.',
            };
      },
    });
    return { asks, told, runs, merger };
  };

  it('runs gh with the rebuilt arguments, closes the ask and tells Jarvis', async () => {
    const { asks, told, runs, merger } = setup();
    asks.add({
      from: 'Jarvis',
      text: 'mergear webapp #2752 a main',
      command: 'gh pr merge 2752 --repo Wiselink/wiselink_frontend_webapp --merge',
    });
    expect(asks.message().open[0]).toMatchObject({
      mergeUrl: WEBAPP,
      mergeCommand: `gh pr merge ${WEBAPP} --merge`,
    });
    expect(await merger.merge('p1')).toEqual({ ok: true, message: 'Mergeado el PR #2752.' });
    expect(runs).toEqual([[WEBAPP, ['--merge']]]);
    expect(asks.find('p1')?.closedHow).toBe('Lo mergeaste desde la oficina');
    expect(told[0]).toContain('[Oficina] Valentín mergeó desde la oficina el PR #2752');
  });

  it('gh saying no keeps the ask, and says why', async () => {
    const { asks, told, merger } = setup(false);
    asks.add({ from: 'Jarvis', text: 'mergear', prUrls: [WEBAPP] });
    const outcome = await merger.merge('p1');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('the base branch policy prohibits the merge');
    expect(asks.open()).toHaveLength(1);
    expect(told).toEqual([]);
  });

  it('no button once the PR is merged or closed, and nothing runs', async () => {
    const { asks, runs, merger } = setup();
    asks.add({ from: 'Jarvis', text: 'mergear', prUrls: [WEBAPP] });
    states.set(WEBAPP, 'merged');
    expect(asks.message().open[0].mergeUrl).toBeUndefined();
    expect((await merger.merge('p1')).ok).toBe(false);
    expect(await merger.merge('p9')).toEqual({
      ok: false,
      message: 'Ese pendiente ya no está abierto.',
    });
    expect(runs).toEqual([]);
  });
});

describe('«Más tarde» and the times an ask carries', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-snooze-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps when, why and what if not; «Más tarde» sets when it comes back', () => {
    const asks = new PendingAsks({ broadcast: () => undefined, file: path.join(dir, 'p.json') });
    asks.add({
      from: 'Jarvis',
      text: 'probar el plano',
      due: 1000,
      why: 'la demo es a las 15',
      ifNot: 'se muestra la de ayer',
    });
    asks.snooze('p1', 5000);
    expect(asks.message().open[0]).toMatchObject({
      due: 1000,
      notBefore: 5000,
      why: 'la demo es a las 15',
      ifNot: 'se muestra la de ayer',
    });
    asks.closeById('p1', 'Lo marcaste hecho');
    expect(asks.message().closed[0].notBefore).toBeUndefined();
  });
});
