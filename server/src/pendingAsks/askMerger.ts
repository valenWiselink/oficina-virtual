/**
 * «Mergear» on a pending ask: Valentín's own click runs `gh pr merge` for the
 * PR the ask names (mergeTarget.ts), with no shell — the URL and the flags are
 * arguments, rebuilt from an allowlist. Whatever gh answers comes back to the
 * page; on success the ask closes and Jarvis hears it, so whoever waited on
 * that merge (a pase, a deploy) can go on.
 */

import { execFile } from 'child_process';

import { openMergeTarget, type PendingAsks } from './pendingAsks.js';

const GH_TIMEOUT_MS = 60_000;

export interface MergeOutcome {
  ok: boolean;
  /** What to show on the card, in Spanish. */
  message: string;
}

export type MergeRunner = (url: string, args: string[]) => Promise<{ ok: boolean; output: string }>;

export const runGhMerge: MergeRunner = (url, args) =>
  new Promise((resolve) => {
    execFile(
      'gh',
      ['pr', 'merge', url, ...args],
      { timeout: GH_TIMEOUT_MS, windowsHide: true, shell: false },
      (err, stdout, stderr) => {
        const output = `${String(stdout)}\n${String(stderr)}`.trim();
        resolve({ ok: !err, output: output || (err ? String(err.message) : '') });
      },
    );
  });

/** gh's answer as one short line for the card. */
function firstLine(output: string): string {
  const line = output
    .split('\n')
    .map((l) => l.replace(/^[✓✗!X]\s*/, '').trim())
    .find(Boolean);
  return (line ?? '').slice(0, 200);
}

export class AskMerger {
  private readonly busy = new Set<string>();

  constructor(
    private readonly deps: {
      asks: () => PendingAsks | undefined;
      /** Tell Jarvis, in its terminal, what was merged. */
      tellJarvis: (text: string) => void;
      run?: MergeRunner;
    },
  ) {}

  async merge(id: string): Promise<MergeOutcome> {
    const asks = this.deps.asks();
    const ask = asks?.find(id);
    if (!asks || !ask || ask.closedAt !== undefined) {
      return { ok: false, message: 'Ese pendiente ya no está abierto.' };
    }
    const target = openMergeTarget(ask);
    if (!target)
      return { ok: false, message: 'No hay un PR abierto para mergear en este pendiente.' };
    if (this.busy.has(ask.id)) return { ok: false, message: 'Ya se está mergeando.' };
    this.busy.add(ask.id);
    try {
      const result = await (this.deps.run ?? runGhMerge)(target.url, target.args);
      if (!result.ok) {
        return {
          ok: false,
          message: `gh no lo mergeó: ${firstLine(result.output) || 'sin detalle'}. Probá con el comando.`,
        };
      }
      asks.merged(ask.id);
      const number = target.url.split('/').pop();
      this.deps.tellJarvis(
        `[Oficina] Valentín mergeó desde la oficina el PR #${number} (${target.url}), el de su pendiente ${ask.id}: «${ask.text}». Si alguien esperaba ese merge, avisale.`,
      );
      return { ok: true, message: `Mergeado el PR #${number}.` };
    } finally {
      this.busy.delete(ask.id);
    }
  }
}
