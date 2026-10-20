import { type AgentView, byUrgency } from './agentViews.js';

/** What an office key opens, or null when the key is not the office's.
 *  Alt+1…9 count the agents on screen (`views`); Alt+N looks at everyone
 *  (`waiting`, all workspaces), so a wait elsewhere is never skipped. */
export function officeKeyTarget(
  ev: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  views: AgentView[],
  waiting: AgentView[] = views,
): number | null {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey) return null;
  const key = ev.key.toLowerCase();
  if (key === 'n') {
    // The one waiting longest (what blocks an agent first); after you answer
    // it leaves "Te necesita", so the next Alt+N takes the next in line.
    return waiting.filter((v) => v.kind === 'needs').sort(byUrgency)[0]?.id ?? null;
  }
  if (/^[1-9]$/.test(key)) {
    return [...views].sort((a, b) => a.id - b.id)[Number(key) - 1]?.id ?? null;
  }
  return null;
}
