import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanFacts,
  savedDaySummary,
  setSummaryRunner,
  SUMMARY_ARGS,
  summaryPrompt,
  writeDaySummary,
} from '../src/daySummary.js';

/**
 * Today's summary by Haiku, with a fake `claude -p`: the real one spends the
 * plan, so it is never run here.
 */
describe('daySummary', () => {
  const dirs: string[] = [];
  afterEach(() => {
    setSummaryRunner(null);
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  const temp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'resumen-'));
    dirs.push(d);
    return d;
  };
  const facts = cleanFacts({
    achievements: [{ project: 'webapp', items: ['Arreglamos los cobros de Mercado Pago.'] }],
    prs: [
      { title: 'Cobros MP', state: 'merged' },
      { title: 'Ferias', state: 'open' },
      { title: 'Viejo', state: 'closed' },
    ],
    tasks: ['Endpoint de cobro'],
  });

  it('runs Haiku with no tools and no session, the facts by stdin', () => {
    expect(SUMMARY_ARGS).toEqual([
      '-p',
      '--model',
      'haiku',
      '--no-session-persistence',
      '--tools',
      '',
      '--output-format',
      'text',
    ]);
    const prompt = summaryPrompt(facts);
    expect(prompt).toContain('Proyecto webapp:\n- Arreglamos los cobros de Mercado Pago.');
    expect(prompt).toContain('PRs mergeados hoy:\n- Cobros MP');
    expect(prompt).toContain('PRs abiertos hoy:\n- Ferias');
    expect(prompt).not.toContain('Viejo');
    expect(prompt).toContain('Tareas completadas:\n- Endpoint de cobro');
  });

  it('keeps only bounded plain text from what the client sent', () => {
    const cleaned = cleanFacts({
      achievements: [{ project: 'x', items: [42, 'ok', ''] }, { project: '', items: ['y'] }, 'z'],
      prs: [{ title: 'A', state: 'raro' }],
      tasks: [{}, 'T'.repeat(1000)],
    });
    expect(cleaned.achievements).toEqual([{ project: 'x', items: ['ok'] }]);
    expect(cleaned.prs).toEqual([{ title: 'A', state: undefined }]);
    expect(cleaned.tasks[0]).toHaveLength(400);
  });

  it('keeps what Haiku wrote for the day and serves it again', async () => {
    const dir = temp();
    const prompts: string[] = [];
    setSummaryRunner(async (prompt) => {
      prompts.push(prompt);
      return { code: 0, out: 'webapp\n- Arreglaste los cobros.\n', err: '', timedOut: false };
    });
    const result = await writeDaySummary(facts, '2026-10-20', dir, () => 1234);
    expect(result).toEqual({
      ok: true,
      summary: {
        type: 'daySummary',
        day: '2026-10-20',
        text: 'webapp\n- Arreglaste los cobros.',
        at: 1234,
      },
    });
    expect(prompts).toHaveLength(1);
    expect(savedDaySummary(dir, '2026-10-20')?.text).toBe('webapp\n- Arreglaste los cobros.');
    expect(savedDaySummary(dir, '2026-10-21')).toBeUndefined();
  });

  it('tells why it failed, and does not run without facts', async () => {
    const dir = temp();
    setSummaryRunner(async () => ({ code: 0, out: '', err: '', timedOut: true }));
    expect(await writeDaySummary(facts, 'd', dir)).toEqual({
      ok: false,
      reason: 'Claude tardó más de 90 segundos',
    });
    setSummaryRunner(async () => ({ code: 1, out: '', err: 'x\nNot logged in', timedOut: false }));
    expect(await writeDaySummary(facts, 'd', dir)).toEqual({
      ok: false,
      reason: 'Claude no pudo: Not logged in',
    });
    let ran = false;
    setSummaryRunner(async () => {
      ran = true;
      return { code: 0, out: 'x', err: '', timedOut: false };
    });
    const empty = cleanFacts({ achievements: [], prs: [], tasks: [] });
    expect((await writeDaySummary(empty, 'd', dir)).ok).toBe(false);
    expect(ran).toBe(false);
    expect(savedDaySummary(dir, 'd')).toBeUndefined();
  });
});
