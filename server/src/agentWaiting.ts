import type { AgentStateStore } from './agentStateStore.js';
import { hasPromotedBackgroundAgent } from './teamUtils.js';
import { cancelPermissionTimer, cancelWaitingTimer } from './timerManager.js';
import { notifyBackgroundAgentCompleted } from './transcriptParser.js';
import type { AgentState } from './types.js';

/** What marking an agent waiting needs from the hook handler. */
export interface WaitingContext {
  agents: AgentStateStore;
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>;
  /** Tool names that spawn subagents (their sub-characters go with the tool). */
  subagentTools: ReadonlySet<string>;
}

/**
 * Transition agent to waiting state. Clears foreground tools (preserves background
 * agents), cancels timers, and notifies the webview. Same logic as the turn_duration
 * handler in transcriptParser.ts.
 */
export function markAgentWaiting(
  ctx: WaitingContext,
  agent: AgentState,
  agentId: number,
  awaitingInput = false,
): void {
  cancelWaitingTimer(agentId, ctx.waitingTimers);
  cancelPermissionTimer(agentId, ctx.permissionTimers);

  // Clear foreground tools, preserve background agents (same logic as turn_duration handler).
  // ALWAYS send agentToolsClear at turn end -- even when activeToolIds is empty by now
  // (because tool_results already processed and removed them). Without this, stale
  // sub-agent characters and permission bubbles from the turn would never clear.
  for (const toolId of [...agent.activeToolIds]) {
    if (agent.backgroundAgentToolIds.has(toolId)) continue;
    agent.activeToolIds.delete(toolId);
    agent.activeToolStatuses.delete(toolId);
    const toolName = agent.activeToolNames.get(toolId);
    agent.activeToolNames.delete(toolId);
    if (toolName && ctx.subagentTools.has(toolName)) {
      agent.activeSubagentToolIds.delete(toolId);
      agent.activeSubagentToolNames.delete(toolId);
      // A foreground spawn dropped at Stop without a tool_result: stop its
      // shadow watch too, or it lingers until sessionEnd.
      notifyBackgroundAgentCompleted(agentId, toolId);
    }
  }
  ctx.agents.broadcast({ type: 'agentToolsClear', id: agentId });
  resendBackgroundTools(ctx.agents, agent, agentId);

  agent.isWaiting = true;
  agent.permissionSent = false;
  agent.hadToolsInTurn = false;
  agent.currentHookToolId = undefined;
  ctx.agents.broadcast({
    type: 'agentStatus',
    id: agentId,
    status: 'waiting',
    awaitingInput,
  });
}

/**
 * Re-send background agent tools to restore them after the clear.
 * toolName + runInBackground are REQUIRED: without them the webview can't
 * recognize the re-sent tool as a subagent spawn and never recreates the
 * Subtask sub-character (extractToolName("Subtask: ...") is not a tool).
 * Skip tools whose background agent was promoted to its own character.
 */
function resendBackgroundTools(agents: AgentStateStore, agent: AgentState, agentId: number): void {
  for (const toolId of agent.backgroundAgentToolIds) {
    if (hasPromotedBackgroundAgent(agentId, toolId, agents)) continue;
    const status = agent.activeToolStatuses.get(toolId);
    if (status) {
      agents.broadcast({
        type: 'agentToolStart',
        id: agentId,
        toolId,
        status,
        toolName: agent.activeToolNames.get(toolId),
        runInBackground: true,
        isTeammateSpawn: agent.teammateSpawnToolIds?.has(toolId) || undefined,
      });
    }
  }
}
