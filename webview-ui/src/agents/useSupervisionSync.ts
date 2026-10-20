import { useEffect, useRef } from 'react';

import type { AgentView } from '../views/agentViews.js';
import type { WorkspaceState } from '../workspaces/workspaceRules.js';
import { sendTeam } from './agentEdits.js';
import { sameTeam, workspaceTeam } from './supervisionRules.js';

/**
 * Keep the office told who each workspace supervisor looks after: workspaces
 * live in the browser, so when an agent joins, leaves or is moved, the new
 * team is sent (only when it changed).
 */
export function useSupervisionSync(views: readonly AgentView[], workspaces: WorkspaceState): void {
  const sent = useRef(new Map<number, string[]>());
  useEffect(() => {
    for (const v of views) {
      const scope = v.supervision;
      if (scope?.kind !== 'workspace' || !scope.workspaceId) continue;
      const team = workspaceTeam(views, v.id, workspaces, scope.workspaceId);
      const last = sent.current.get(v.id);
      if (last && sameTeam(last, team)) continue;
      sent.current.set(v.id, team);
      sendTeam(v.id, team);
    }
  }, [views, workspaces]);
}
