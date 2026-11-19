import { useMemo, useRef, useSyncExternalStore } from 'react';

import type { PermissionPending } from '../../../core/src/messages.js';
import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import { getIdentity } from '../identity/identityStore.js';
import { isResearching, registerSubagentKey } from '../identity/researchStore.js';
import { hasTurnInProgress } from '../identity/turnStore.js';
import { isYourTurnDone } from '../identity/yourTurnStore.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { isAskingPermission, permissionSince } from '../permissions/permissionSinceStore.js';
import { type AgentView, buildAgentViews } from './agentViews.js';
import { reuseUnchanged } from './viewsReuse.js';
import { subscribeViews, viewsVersion } from './viewsSignal.js';

interface UseAgentViewsInputs {
  getOfficeState: () => OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentCharacters: SubagentCharacter[];
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  permissions: PermissionPending[];
  terminalAgentIds: number[];
  /** Per-agent status from the server ('waiting' = turn finished). */
  agentStatuses: Record<number, string>;
}

/**
 * Every agent as the board and the graph show it. Rebuilt only when one of
 * its sources can have changed (viewsSignal), and an agent whose view is the
 * same keeps the same object, so nothing re-renders while nothing happens.
 */
export function useAgentViews(input: UseAgentViewsInputs): AgentView[] {
  const version = useSyncExternalStore(subscribeViews, viewsVersion);
  const previous = useRef<AgentView[]>([]);
  const {
    getOfficeState,
    agents,
    agentTools,
    subagentCharacters,
    subagentTools,
    permissions,
    terminalAgentIds,
    agentStatuses,
  } = input;

  return useMemo(() => {
    for (const s of subagentCharacters) registerSubagentKey(s.parentAgentId, s.parentToolId, s.id);
    const os = getOfficeState();
    const next = buildAgentViews({
      agentIds: agents,
      characters: os.characters,
      agentTools,
      subagents: subagentCharacters,
      subagentTools,
      permissions,
      terminalAgentIds,
      identity: getIdentity,
      finished: (id) => agentStatuses[id] === 'waiting',
      askingPermission: isAskingPermission,
      permissionSince,
      yourTurnDone: isYourTurnDone,
      inTurn: hasTurnInProgress,
      researching: (id) => isResearching(id),
    });
    previous.current = reuseUnchanged(previous.current, next);
    return previous.current;
    // `version` is the signal that the stores read above moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    version,
    getOfficeState,
    agents,
    agentTools,
    subagentCharacters,
    subagentTools,
    permissions,
    terminalAgentIds,
    agentStatuses,
  ]);
}
