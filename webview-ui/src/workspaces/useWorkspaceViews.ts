import { useCallback, useEffect, useRef } from 'react';

import type { AgentView } from '../views/agentViews.js';
import {
  changedKeys,
  inWorkspace,
  needsByWorkspace,
  newcomersToAssign,
  workspaceOf,
  type WorkspaceState,
} from './workspaceRules.js';
import { assignAgent, followAgentKeys, useWorkspaces, workspaceState } from './workspaceStore.js';

export interface WorkspaceViews {
  state: WorkspaceState;
  /** The agents of the workspace on screen. */
  shown: AgentView[];
  /** Agents needing you, per workspace id (and ALL). */
  needs: Record<string, number>;
  /** The name of the workspace an agent is in, if any. */
  spaceOf: (view: AgentView) => string | undefined;
}

/**
 * The agents of the workspace on screen, and the bookkeeping that keeps
 * workspaces right as agents come and go: an agent launched while a
 * workspace is on screen joins it, and a manual assignment follows an agent
 * whose key changes (its session id arriving after its name).
 */
export function useWorkspaceViews(views: AgentView[]): WorkspaceViews {
  const state = useWorkspaces();
  const seen = useRef<Map<number, string> | null>(null);
  const signature = views.map((v) => `${v.id}:${v.key}`).join(',');
  useEffect(() => {
    const before = seen.current;
    seen.current = new Map(views.map((v) => [v.id, v.key]));
    followAgentKeys(changedKeys(before, views));
    const ids = before ? new Set(before.keys()) : null;
    for (const n of newcomersToAssign(ids, views, workspaceState())) {
      assignAgent(n.key, n.workspaceId);
    }
    // The signature is what changes: views is a new array every render.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const spaceOf = useCallback(
    (view: AgentView) => {
      const id = workspaceOf(view, state);
      return state.workspaces.find((w) => w.id === id)?.name;
    },
    [state],
  );
  return {
    state,
    shown: inWorkspace(views, state, state.current),
    needs: needsByWorkspace(views, state),
    spaceOf,
  };
}
