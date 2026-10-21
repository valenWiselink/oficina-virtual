/**
 * The plan's usage limits as Claude Code reports them to a status line
 * command: `rate_limits.five_hour` and `rate_limits.seven_day`, each with
 * `used_percentage` (0-100) and `resets_at` (Unix epoch seconds). Documented
 * at https://code.claude.com/docs/en/statusline#rate-limit-usage — present
 * only for claude.ai Pro/Max subscribers, after a session's first response.
 *
 * Pure (no fs): the status line script and the server both use it, and it is
 * tested without a home folder.
 */

/** One limit window. */
export interface RateWindow {
  /** How much of the window is used, 0-100. */
  usedPercentage: number;
  /** When the window resets, Unix epoch SECONDS (as Claude Code sends it). */
  resetsAt: number;
}

export interface RateLimits {
  /** The 5-hour session window. */
  fiveHour?: RateWindow;
  /** The weekly window. */
  sevenDay?: RateWindow;
}

/** What the status line script keeps on disk for the office to read. */
export interface LimitsSnapshot extends RateLimits {
  /** When a status line last confirmed the newest numbers (ms epoch). */
  observedAt: number;
}

/** The file under ~/.pixel-agents where the status line leaves the limits. */
export const LIMITS_FILE_NAME = 'limites.json';

/**
 * Two reports of the same window can differ by a little in `resets_at`; a
 * NEW window resets at least 5 hours after the old one did (it starts with
 * the first request after the reset), so anything closer is the same window.
 */
const SAME_WINDOW_TOLERANCE_SEC = 60 * 60;

function readWindow(raw: unknown): RateWindow | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { used_percentage: used, resets_at: resets } = raw as Record<string, unknown>;
  if (typeof used !== 'number' || !Number.isFinite(used)) return undefined;
  if (typeof resets !== 'number' || !Number.isFinite(resets) || resets <= 0) return undefined;
  return { usedPercentage: Math.max(0, used), resetsAt: resets };
}

/** The limits in a status line's JSON input, or null when it carries none
 *  (an API-key user, or a session before its first response). */
export function rateLimitsFromStatusLine(input: unknown): RateLimits | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = (input as { rate_limits?: unknown }).rate_limits;
  if (typeof raw !== 'object' || raw === null) return null;
  const { five_hour: five, seven_day: seven } = raw as Record<string, unknown>;
  const limits: RateLimits = {};
  const fiveHour = readWindow(five);
  const sevenDay = readWindow(seven);
  if (fiveHour) limits.fiveHour = fiveHour;
  if (sevenDay) limits.sevenDay = sevenDay;
  return fiveHour || sevenDay ? limits : null;
}

/**
 * The newer of two reports of a window. Every session's status line writes
 * the same file, and an idle one re-runs with the numbers of its last
 * response (minutes or hours old), so the last writer is not the freshest:
 * a later window wins, and within one window the higher use wins (use only
 * grows until the window resets).
 */
export function newerWindow(a?: RateWindow, b?: RateWindow): RateWindow | undefined {
  if (!a || !b) return a ?? b;
  if (Math.abs(a.resetsAt - b.resetsAt) > SAME_WINDOW_TOLERANCE_SEC) {
    return a.resetsAt > b.resetsAt ? a : b;
  }
  return b.usedPercentage >= a.usedPercentage ? b : a;
}

/** Whether `report` says something at least as new as `known`. */
function isCurrent(report: RateWindow | undefined, known: RateWindow | undefined): boolean {
  return report !== undefined && newerWindow(known, report) === report;
}

/**
 * Fold one status line report into what is on disk. `observedAt` moves only
 * when the report agrees with the newest numbers, so a stale session
 * re-running does not make old data look fresh.
 */
export function mergeLimits(
  prev: LimitsSnapshot | null,
  report: RateLimits,
  now: number,
): LimitsSnapshot {
  const fiveHour = newerWindow(prev?.fiveHour, report.fiveHour);
  const sevenDay = newerWindow(prev?.sevenDay, report.sevenDay);
  const current =
    isCurrent(report.fiveHour, prev?.fiveHour) || isCurrent(report.sevenDay, prev?.sevenDay);
  const merged: LimitsSnapshot = { observedAt: current || !prev ? now : prev.observedAt };
  if (fiveHour) merged.fiveHour = fiveHour;
  if (sevenDay) merged.sevenDay = sevenDay;
  return merged;
}

/** The snapshot file's content, or null when it is missing or not ours. */
export function parseLimitsSnapshot(raw: string): LimitsSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.observedAt !== 'number' || !Number.isFinite(obj.observedAt)) return null;
  const snapshot: LimitsSnapshot = { observedAt: obj.observedAt };
  const fiveHour = readStoredWindow(obj.fiveHour);
  const sevenDay = readStoredWindow(obj.sevenDay);
  if (fiveHour) snapshot.fiveHour = fiveHour;
  if (sevenDay) snapshot.sevenDay = sevenDay;
  return snapshot;
}

function readStoredWindow(raw: unknown): RateWindow | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { usedPercentage, resetsAt } = raw as Record<string, unknown>;
  return readWindow({ used_percentage: usedPercentage, resets_at: resetsAt });
}

/**
 * The status line Claude Code shows under the prompt: "5 h: 23 % · semana:
 * 41 %". A window that already reset is left out (its number is over).
 */
export function statusLineText(limits: RateLimits, now: number): string {
  const nowSec = now / 1000;
  const part = (label: string, w?: RateWindow) =>
    w && w.resetsAt > nowSec ? `${label}: ${Math.round(w.usedPercentage)} %` : null;
  return [part('5 h', limits.fiveHour), part('semana', limits.sevenDay)]
    .filter((p): p is string => p !== null)
    .join(' · ');
}
