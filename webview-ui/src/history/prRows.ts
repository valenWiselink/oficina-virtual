import type { DayLogEntry, PrStatus } from '../../../core/src/messages.js';
import type { AgentView } from '../views/agentViews.js';

export interface PrRow {
  url: string;
  /** "repo#123" from the URL. */
  short: string;
  agent: string;
  agentId?: number;
  title?: string;
  state?: PrStatus['state'];
}

/** "pixel-agents#12" from a GitHub PR URL (the URL itself otherwise). */
export function shortPr(url: string): string {
  const m = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(url);
  return m ? `${m[1]}#${m[2]}` : url;
}

const ORDER: Record<string, number> = { open: 0, unknown: 1, merged: 2, closed: 3 };

/**
 * Every PR your agents produced: the ones waiting in a "te toca" now and the
 * ones today's history recorded, once each, with what GitHub says about them.
 * Open first (they are the ones to review), then merged, then closed.
 */
export function collectPrs(
  views: readonly AgentView[],
  entries: readonly DayLogEntry[],
  statuses: ReadonlyMap<string, PrStatus>,
): PrRow[] {
  const rows = new Map<string, PrRow>();
  const add = (url: string, agent: string, agentId?: number) => {
    if (rows.has(url)) return;
    const status = statuses.get(url);
    rows.set(url, {
      url,
      short: shortPr(url),
      agent,
      agentId,
      title: status?.title,
      state: status?.state,
    });
  };
  for (const v of views) if (v.prUrl) add(v.prUrl, v.name, v.id);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.prUrl) add(e.prUrl, e.agent, e.agentId);
  }
  return [...rows.values()].sort(
    (a, b) => ORDER[a.state ?? 'unknown'] - ORDER[b.state ?? 'unknown'],
  );
}
