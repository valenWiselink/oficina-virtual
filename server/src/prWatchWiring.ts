import type { AgentStateStore } from './agentStateStore.js';
import type { DayLog } from './dayLog.js';
import { PrWatch } from './prWatch.js';

/**
 * Start watching the PRs the agents left you: those in a live agent's
 * "te toca" plus today's history. Each state change goes to the offices; a
 * PR seen open and now merged is also written to today's history.
 */
export function watchAgentPrs(store: AgentStateStore, dayLog: DayLog): PrWatch {
  const watch = new PrWatch({
    collect: () => [
      ...[...store.values()].flatMap((a) => (a.yourTurn?.prUrl ? [a.yourTurn.prUrl] : [])),
      ...dayLog.prUrls(),
    ],
    onStatus: (status, previous) => {
      store.broadcast({ type: 'prStatus', ...status });
      if (status.state === 'merged' && previous === 'open')
        dayLog.prMerged(status.url, status.title);
    },
    log: (line) => console.log(line),
  });
  watch.start();
  return watch;
}
