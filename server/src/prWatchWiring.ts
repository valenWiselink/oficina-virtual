import { identityMessage, runningBackground } from './agentIdentity.js';
import type { AgentStateStore } from './agentStateStore.js';
import type { DayLog } from './dayLog.js';
import { setPrStates, settleMergedAsks } from './mergedAsk.js';
import { type GhRunner, PrWatch } from './prWatch.js';
import { sendToTerminal } from './terminal/handOff.js';

/**
 * Start watching the PRs the agents left you: those in a live agent's
 * "te toca" plus today's history. Each state change goes to the offices; a
 * PR seen open and now merged is also written to today's history. A merge
 * also settles the "te toca" that only asked for it (mergedAsk.ts), before
 * the offices hear of the merge so their celebration finds the agent.
 */
export function watchAgentPrs(
  store: AgentStateStore,
  dayLog: Pick<DayLog, 'prUrls' | 'prMerged'>,
  opts: {
    /** The office terminal of an agent, to tell it its PR got merged. */
    terminalOf?: (id: number) => { write(data: string): void } | undefined;
    run?: GhRunner;
  } = {},
): PrWatch {
  const terminalOf = opts.terminalOf ?? (() => undefined);
  const watch = new PrWatch({
    run: opts.run,
    collect: () => [
      ...[...store.values()].flatMap((a) => (a.yourTurn?.prUrl ? [a.yourTurn.prUrl] : [])),
      ...dayLog.prUrls(),
    ],
    onStatus: (status, previous) => {
      const settled = settleMergedAsks(store.entries(), status, previous === 'open', {
        terminalOf,
        send: sendToTerminal,
        backgroundOf: (agent) => runningBackground(agent).length,
      });
      for (const id of settled) {
        const agent = store.get(id);
        if (agent) store.broadcast(identityMessage(id, agent));
      }
      store.broadcast({ type: 'prStatus', ...status });
      if (status.state === 'merged' && previous === 'open')
        dayLog.prMerged(status.url, status.title);
    },
    log: (line) => console.log(line),
  });
  setPrStates((url) => watch.stateOf(url));
  watch.start();
  return watch;
}
