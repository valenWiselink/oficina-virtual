import type { HookHealth as HookHealthMessage } from '../../core/src/messages.js';

/** Failures counted: the last 10 minutes. */
export const HOOK_HEALTH_WINDOW_MS = 10 * 60_000;
/** From this many failures in the window, the office says so. One cut hook
 *  can be a hiccup; on 2026-10-21 there were 27 in 18 minutes. */
export const HOOK_HEALTH_THRESHOLD = 5;
/** Record ids remembered to count a re-read line only once. */
const REMEMBERED_RECORDS = 1000;

/** The office's own hook: its script in any command shape (node, the
 *  desktop app's exe, either slash, any case). */
const OUR_HOOK_SCRIPT = /[\\/]\.pixel-agents[\\/]hooks[\\/](claude-hook|pixel-agents-hook)\.js/i;

export interface HookFailure {
  id: string;
  at: number;
  timedOut: boolean;
  durationMs?: number;
  error?: string;
}

/**
 * A transcript record that says one of the office's hooks failed, or null.
 * Claude Code writes an `attachment` record for every hook it cut for taking
 * too long (`hook_cancelled`, with timedOut) and every hook that exited with
 * an error (`hook_non_blocking_error`, with stderr); `command` names the hook.
 */
export function hookFailureOf(record: unknown): HookFailure | null {
  if (typeof record !== 'object' || record === null) return null;
  const r = record as {
    type?: unknown;
    uuid?: unknown;
    timestamp?: unknown;
    attachment?: Record<string, unknown>;
  };
  const a = r.attachment;
  if (r.type !== 'attachment' || typeof a !== 'object' || a === null) return null;
  if (a.type !== 'hook_cancelled' && a.type !== 'hook_non_blocking_error') return null;
  if (typeof a.command !== 'string' || !OUR_HOOK_SCRIPT.test(a.command)) return null;
  const at = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
  if (!Number.isFinite(at)) return null;
  const stderr = typeof a.stderr === 'string' ? a.stderr : '';
  const error = stderr
    .replace(/^Failed with non-blocking status code:\s*/i, '')
    .split('\n')[0]
    .trim();
  return {
    id: typeof r.uuid === 'string' ? r.uuid : `${at}:${String(a.hookName)}`,
    at,
    timedOut: a.timedOut === true,
    durationMs: typeof a.durationMs === 'number' ? a.durationMs : undefined,
    error: error || undefined,
  };
}

/**
 * Counts the office's own hook failures that the transcripts report and says
 * when they pass the threshold: without it the office kept showing old states
 * while ~2,000 hooks failed ("bad option: --oficina-hook", 2026-10-20) and
 * nobody knew. Old records (a transcript read from the start) fall outside
 * the window by their own timestamps.
 */
export class HookHealth {
  private failures: HookFailure[] = [];
  private readonly seen = new Set<string>();
  private failing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onChange: (status: HookHealthMessage) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Feed every transcript record (anything but our failures is ignored). */
  observe(record: unknown): void {
    const failure = hookFailureOf(record);
    if (!failure || this.seen.has(failure.id)) return;
    this.seen.add(failure.id);
    if (this.seen.size > REMEMBERED_RECORDS) {
      this.seen.delete(this.seen.values().next().value as string);
    }
    if (this.now() - failure.at > HOOK_HEALTH_WINDOW_MS) return;
    this.failures.push(failure);
    this.evaluate(true);
  }

  status(): HookHealthMessage {
    this.prune();
    const timed = this.failures.filter((f) => f.timedOut);
    const slowest = Math.max(0, ...timed.map((f) => f.durationMs ?? 0));
    const lastError = [...this.failures].reverse().find((f) => f.error)?.error;
    return {
      type: 'hookHealth',
      failing: this.failures.length >= HOOK_HEALTH_THRESHOLD,
      failures: this.failures.length,
      timedOut: timed.length,
      ...(slowest > 0 ? { slowestMs: slowest } : {}),
      ...(lastError ? { lastError } : {}),
    };
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Tell when the verdict flips, or on news while failing (the counts). */
  private evaluate(news: boolean): void {
    const status = this.status();
    const flipped = status.failing !== this.failing;
    this.failing = status.failing;
    if (flipped || (news && status.failing)) this.onChange(status);
    this.scheduleExpiry();
  }

  /** While failing, look again when the oldest failure leaves the window. */
  private scheduleExpiry(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.failing || this.failures.length === 0) return;
    const oldest = Math.min(...this.failures.map((f) => f.at));
    const wait = Math.max(1000, oldest + HOOK_HEALTH_WINDOW_MS - this.now() + 1);
    this.timer = setTimeout(() => this.evaluate(false), wait);
    this.timer.unref?.();
  }

  private prune(): void {
    const from = this.now() - HOOK_HEALTH_WINDOW_MS;
    this.failures = this.failures.filter((f) => f.at >= from);
  }
}

/** The office's one HookHealth, for a client that connects mid-way. */
let current: HookHealth | null = null;

export function setCurrentHookHealth(health: HookHealth | null): void {
  current = health;
}

/** What a connecting client must hear: only a failing verdict (the page
 *  starts out assuming the hooks work). */
export function hookHealthForNewClient(): HookHealthMessage | null {
  const status = current?.status();
  return status?.failing ? status : null;
}
