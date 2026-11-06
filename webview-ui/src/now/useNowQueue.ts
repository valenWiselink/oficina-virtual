import type { PendingAskEntry } from '../../../core/src/messages.js';
import { useNow } from '../hooks/useNow.js';
import { useUpcomingMeetings } from '../meetings/meetingsStore.js';
import { usePendingAsks } from '../pendingAsks/pendingAsksStore.js';
import { splitOpen } from '../pendingAsks/pendingAsksView.js';
import type { AgentKind, AgentView } from '../views/agentViews.js';
import { type NowQueue, nowQueue } from './nowRules.js';
import { dayStrip, type StripItem } from './stripRules.js';

/** Kinds that are getting on by themselves: naming them holds nobody back. */
const BUSY: ReadonlySet<AgentKind> = new Set(['work', 'think', 'research', 'meet']);

export interface NowModel {
  now: number;
  queue: NowQueue<PendingAskEntry>;
  strip: StripItem[];
  seemsDone: PendingAskEntry[];
  closed: PendingAskEntry[];
  /** The office never sent the list (read-only, older server). */
  missing: boolean;
}

/** Everything «Ahora» and its strip show, from what the office sent. */
export function useNowQueue(views: readonly AgentView[], jarvisId: number | undefined): NowModel {
  const list = usePendingAsks();
  const meetingsMsg = useUpcomingMeetings();
  const now = useNow();
  const { waiting, seemsDone } = splitOpen(list?.open ?? []);
  const meetings = meetingsMsg?.connected ? meetingsMsg.meetings : [];
  const agents = views
    .filter((v) => v.id !== jarvisId)
    .map((v) => ({ name: v.name, busy: BUSY.has(v.kind) }));
  const queue = nowQueue(waiting, { now, agents, meetings });
  const ranked = [...(queue.first ? [queue.first] : []), ...queue.next, ...queue.later];
  return {
    now,
    queue,
    strip: dayStrip(meetings, ranked, now),
    seemsDone,
    closed: list?.closed ?? [],
    missing: list === null,
  };
}
