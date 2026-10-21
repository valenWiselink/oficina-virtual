/**
 * Which of the agents' PRs got merged, asked to the GitHub CLI: the office
 * can only celebrate a merge it actually knows about. URLs come from the
 * agents' "te toca" and today's history; each open one is asked every couple
 * of minutes with `gh pr view <url> --json state,mergedAt,title` until it is
 * merged or closed. Without gh (or logged out) it says so once and stops.
 *
 * gh is run with execFile and no shell: the URL is an argument, never part of
 * a command line a shell would parse, and it must match PR_URL anyway. On
 * Windows libuv finds gh.exe on PATH by itself; a gh that is only a .cmd shim
 * is treated as missing rather than routed through cmd.exe.
 */

import { execFile } from 'child_process';

import type { PrState, PrStatus } from '../../core/src/messages.js';

export const PR_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/;
const POLL_MS = 2 * 60_000;
const GH_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT = 4;
/** A URL that keeps failing (deleted repo, no access) is dropped after this. */
const MAX_FAILURES = 5;

/** What one `gh pr view` said: a state, or why it could not. */
export type GhAnswer =
  | { ok: true; state: PrState; title?: string; mergedAt?: string }
  | { ok: false; fatal: boolean; reason: string };

export type GhRunner = (url: string) => Promise<GhAnswer>;

/** Turn gh's JSON (state OPEN/MERGED/CLOSED) into our status fields. */
export function parseGhView(stdout: string): GhAnswer {
  try {
    const raw = JSON.parse(stdout) as { state?: unknown; title?: unknown; mergedAt?: unknown };
    const state = String(raw.state ?? '').toLowerCase();
    if (state !== 'open' && state !== 'merged' && state !== 'closed') {
      return { ok: false, fatal: false, reason: `unexpected state ${String(raw.state)}` };
    }
    return {
      ok: true,
      state,
      title: typeof raw.title === 'string' ? raw.title : undefined,
      mergedAt: typeof raw.mergedAt === 'string' && raw.mergedAt ? raw.mergedAt : undefined,
    };
  } catch {
    return { ok: false, fatal: false, reason: 'unreadable gh output' };
  }
}

/** gh missing or logged out stops the whole watch; anything else is per URL. */
export function classifyGhError(code: unknown, stderr: string): GhAnswer {
  if (code === 'ENOENT') return { ok: false, fatal: true, reason: 'gh is not installed' };
  if (/gh auth login|not logged in|authentication/i.test(stderr)) {
    return { ok: false, fatal: true, reason: 'gh is not logged in' };
  }
  return { ok: false, fatal: false, reason: stderr.trim().split('\n')[0] || String(code) };
}

export const runGh: GhRunner = (url) =>
  new Promise((resolve) => {
    execFile(
      'gh',
      ['pr', 'view', url, '--json', 'state,mergedAt,title'],
      { timeout: GH_TIMEOUT_MS, windowsHide: true, shell: false },
      (err, stdout, stderr) => {
        if (err) resolve(classifyGhError((err as NodeJS.ErrnoException).code, String(stderr)));
        else resolve(parseGhView(String(stdout)));
      },
    );
  });

export interface PrWatchDeps {
  /** Every PR URL known right now (agents' "te toca", today's history). */
  collect: () => Iterable<string>;
  /** A status was learned or changed. */
  onStatus: (status: PrStatus, previous: PrState | undefined) => void;
  run?: GhRunner;
  log?: (line: string) => void;
}

export class PrWatch {
  private readonly statuses = new Map<string, PrStatus>();
  private readonly failures = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private disabled = false;
  private ticking = false;

  constructor(private readonly deps: PrWatchDeps) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Every status learned so far (for a client that just connected). */
  all(): PrStatus[] {
    return [...this.statuses.values()];
  }

  /** The state learned for one PR, if any. */
  stateOf(url: string): PrState | undefined {
    return this.statuses.get(url)?.state;
  }

  /** Ask gh about every known PR still worth asking about. */
  async tick(): Promise<void> {
    if (this.disabled || this.ticking) return;
    this.ticking = true;
    try {
      const queue = this.pending();
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, async () => {
        for (let url = queue.shift(); url && !this.disabled; url = queue.shift()) {
          await this.check(url);
        }
      });
      await Promise.all(workers);
    } finally {
      this.ticking = false;
    }
  }

  /** Known, valid, not yet merged or closed, not given up on. */
  private pending(): string[] {
    const urls = new Set<string>();
    for (const url of this.deps.collect()) {
      if (!PR_URL.test(url)) continue;
      const state = this.statuses.get(url)?.state;
      if (state === 'merged' || state === 'closed') continue;
      if ((this.failures.get(url) ?? 0) >= MAX_FAILURES) continue;
      urls.add(url);
    }
    return [...urls];
  }

  private async check(url: string): Promise<void> {
    const answer = await (this.deps.run ?? runGh)(url);
    if (!answer.ok) {
      if (answer.fatal) {
        this.disabled = true;
        this.deps.log?.(`[Pixel Agents] PRs: ${answer.reason}; not watching merges`);
      } else {
        this.failures.set(url, (this.failures.get(url) ?? 0) + 1);
      }
      return;
    }
    this.failures.delete(url);
    const previous = this.statuses.get(url);
    const status: PrStatus = { url, state: answer.state };
    if (answer.title) status.title = answer.title;
    if (answer.mergedAt) status.mergedAt = answer.mergedAt;
    this.statuses.set(url, status);
    if (previous?.state !== status.state) this.deps.onStatus(status, previous?.state);
  }
}
