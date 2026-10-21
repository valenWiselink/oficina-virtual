import { useEffect, useState } from 'react';

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

/** Views refresh this often: enough for status changes, cheap for React. */
const REFRESH_MS = 250;

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

/** Every agent as the board and the graph show it, kept fresh. */
export function useAgentViews(input: UseAgentViewsInputs): AgentView[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  for (const s of input.subagentCharacters)
    registerSubagentKey(s.parentAgentId, s.parentToolId, s.id);
  const os = input.getOfficeState();
  return buildAgentViews({
    agentIds: input.agents,
    characters: os.characters,
    agentTools: input.agentTools,
    subagents: input.subagentCharacters,
    subagentTools: input.subagentTools,
    permissions: input.permissions,
    terminalAgentIds: input.terminalAgentIds,
    identity: getIdentity,
    finished: (id) => input.agentStatuses[id] === 'waiting',
    askingPermission: isAskingPermission,
    permissionSince,
    yourTurnDone: isYourTurnDone,
    inTurn: hasTurnInProgress,
    researching: (id) => isResearching(id),
  });
}
