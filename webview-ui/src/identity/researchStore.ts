import { createResearchTracker, RESEARCH_LINGER_MS } from '../office/behaviors/researchTracker.js';
import { transport } from '../transport/index.js';
import { bumpViews } from '../views/viewsSignal.js';

/**
 * Who is researching right now (a web search, or a streak of reads with no
 * edit in between), for every agent and subagent, fed from the same tool
 * events the rest of the office sees. Subagent events arrive keyed by
 * (parent, tool) and are resolved to their character id by the caller.
 */
const tracker = createResearchTracker();
const subKeys = new Map<string, number>();

/** Map a subagent's (parent, spawn tool) to the id its character got. */
export function registerSubagentKey(parentId: number, parentToolId: string, subId: number): void {
  subKeys.set(`${parentId}:${parentToolId}`, subId);
}

/** "Investigando" ends on its own once the linger runs out with no new read:
 *  nothing else would tell the views (they no longer redraw on a timer). */
let lingerTimer: ReturnType<typeof setTimeout> | undefined;
function bumpWhenLingerEnds(): void {
  if (lingerTimer !== undefined) clearTimeout(lingerTimer);
  lingerTimer = setTimeout(() => {
    lingerTimer = undefined;
    bumpViews();
  }, RESEARCH_LINGER_MS + 50);
}

transport.onMessage((msg) => {
  if (msg.type === 'agentToolStart') {
    tracker.toolStarted(msg.id, msg.toolName, msg.status);
    bumpWhenLingerEnds();
  } else if (msg.type === 'subagentToolStart') {
    const subId = subKeys.get(`${msg.id}:${msg.parentToolId}`);
    if (subId !== undefined) {
      tracker.toolStarted(subId, undefined, msg.status);
      bumpWhenLingerEnds();
    }
  } else if (msg.type === 'agentToolsClear') {
    tracker.stop(msg.id);
  } else if (msg.type === 'agentStatus' && msg.status === 'waiting') {
    tracker.stop(msg.id);
  }
});

export function isResearching(id: number, now = Date.now()): boolean {
  return tracker.isResearching(id, now);
}
