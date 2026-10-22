/**
 * The office's side of Jarvis's keeper (jarvisKeeper.ts): how it opens,
 * closes and relaunches Jarvis. Kept apart so the keeper stays testable
 * without terminals.
 */

import { relaunch } from '../agentEdits.js';
import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { claudeProvider } from '../providers/index.js';
import { closeOfficeAgent } from '../terminal/closeAgent.js';
import type { PtySessionManager } from '../terminal/ptySessionManager.js';
import { launchAgent } from '../terminal/standaloneAgentLauncher.js';
import type { AgentState } from '../types.js';
import { JARVIS_NAME, Notebook } from './jarvis.js';
import { JarvisKeeper } from './jarvisKeeper.js';
import { supervisors } from './supervision.js';
import { broadcastSupervision } from './supervisionMessages.js';

export function officeJarvisKeeper(office: {
  store: AgentStateStore;
  runtime: AgentRuntime;
  ptyManager: PtySessionManager;
  bypass: () => boolean;
  hasPending: (agent: AgentState) => boolean;
}): JarvisKeeper {
  const { store, runtime, ptyManager } = office;
  const deps = { store, runtime, ptyManager, provider: claudeProvider };
  return new JarvisKeeper({
    store,
    roleOf: (sessionId) => supervisors().roleOf(sessionId),
    launch: async (folder, prompt) => {
      const id = await launchAgent(deps, {
        directoryPath: folder,
        nickname: JARVIS_NAME,
        supervision: { kind: 'all' },
        prompt,
        bypassPermissions: office.bypass(),
      });
      // Born a supervisor: every office learns who it watches over.
      if (id !== null) broadcastSupervision(store);
      return id;
    },
    close: (id) => closeOfficeAgent({ store, runtime, ptyManager }, id),
    relaunch: (id) =>
      relaunch(deps, id, {}, office.bypass(), (done) => {
        if (done.ok) broadcastSupervision(store);
      }).then((result) => {
        if (result.ok && !result.queued) broadcastSupervision(store);
        return result;
      }),
    hasPending: office.hasPending,
    notebook: new Notebook(),
  });
}
