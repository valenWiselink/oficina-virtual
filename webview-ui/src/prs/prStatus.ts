import type { PrStatus } from '../../../core/src/messages.js';

/**
 * The state of the agents' PRs, as the server learns it from GitHub: all
 * known ones on connect (`prStatuses`), then each change (`prStatus`). A PR
 * that turns merged while you watch is news (onPrMerged); one already merged
 * when you connect is history.
 */
export function applyPrMessage(
  current: ReadonlyMap<string, PrStatus>,
  msg: Record<string, unknown>,
): { next: ReadonlyMap<string, PrStatus>; merged: string[] } | null {
  if (msg.type === 'prStatuses') {
    const items = Array.isArray(msg.items) ? (msg.items as PrStatus[]) : [];
    return { next: new Map(items.map((s) => [s.url, s])), merged: [] };
  }
  if (msg.type !== 'prStatus' || typeof msg.url !== 'string') return null;
  const status: PrStatus = { url: msg.url, state: msg.state as PrStatus['state'] };
  if (typeof msg.title === 'string') status.title = msg.title;
  if (typeof msg.mergedAt === 'string') status.mergedAt = msg.mergedAt;
  const before = current.get(status.url);
  const next = new Map(current);
  next.set(status.url, status);
  const merged = status.state === 'merged' && before?.state !== 'merged' ? [status.url] : [];
  return { next, merged };
}
