import type { AgentStateStore } from './agentStateStore.js';
import { PERMISSION_TIMER_DELAY_MS } from './constants.js';
import { screenAsks } from './screenAsks.js';
import { hasPromotedBackgroundAgent } from './teamUtils.js';
import type { AgentState } from './types.js';

/**
 * Whether the timer heuristics may guess "needs permission" / "done" from
 * transcript silence. Off while hooks are installed: then every state comes
 * from a hook, and a session that sends none (started before the install)
 * shows nothing rather than a guess — the office must never claim a state it
 * does not know.
 */
let stateGuessingAllowed = true;

export function setStateGuessingAllowed(allowed: boolean): void {
  stateGuessingAllowed = allowed;
}

/**
 * The screen of an agent's office terminal, when it has one. A tool silent for
 * a few seconds is only waiting on a permission if that screen shows the menu:
 * a long shell command looks just the same in the transcript (2026-10-30, a
 * 45 s command shown as a question that locked the chat). An agent without an
 * office terminal (an outside session) can only be guessed, as before.
 */
let screenOf: (agentId: number) => readonly string[] | undefined = () => undefined;

export function setPermissionScreenReader(
  reader: (agentId: number) => readonly string[] | undefined,
): void {
  screenOf = reader;
}

export function clearAgentActivity(
  agent: AgentState | undefined,
  agentId: number,
  agents: AgentStateStore,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  if (!agent) return;

  // Preserve background agent tools — only clear foreground state.
  // The subagent maps are keyed by parentToolId; deleting a non-parent key is a
  // safe no-op, so no tool-name check is needed here.
  if (agent.backgroundAgentToolIds.size > 0) {
    for (const toolId of agent.activeToolIds) {
      if (agent.backgroundAgentToolIds.has(toolId)) continue;
      agent.activeToolIds.delete(toolId);
      agent.activeToolStatuses.delete(toolId);
      agent.activeToolNames.delete(toolId);
      agent.activeSubagentToolIds.delete(toolId);
      agent.activeSubagentToolNames.delete(toolId);
    }
  } else {
    agent.activeToolIds.clear();
    agent.activeToolStatuses.clear();
    agent.activeToolNames.clear();
    agent.activeSubagentToolIds.clear();
    agent.activeSubagentToolNames.clear();
  }

  agent.isWaiting = false;
  agent.permissionSent = false;
  cancelPermissionTimer(agentId, permissionTimers);
  agents.broadcast({ type: 'agentToolsClear', id: agentId });
  // Re-send background agent tools so webview re-creates their sub-agents.
  // toolName + runInBackground are REQUIRED: without them the webview can't
  // recognize the re-sent tool as a subagent spawn and never recreates the
  // Subtask sub-character. Skip tools whose spawn became its own character
  // (named background teammate) -- re-sending would spawn a ghost alongside it.
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
  agents.broadcast({ type: 'agentStatus', id: agentId, status: 'active' });
}

export function cancelWaitingTimer(
  agentId: number,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const timer = waitingTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    waitingTimers.delete(agentId);
  }
}

export function startWaitingTimer(
  agentId: number,
  delayMs: number,
  agents: AgentStateStore,
  waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  cancelWaitingTimer(agentId, waitingTimers);
  if (!stateGuessingAllowed) return;
  const timer = setTimeout(() => {
    waitingTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (agent) {
      agent.isWaiting = true;
    }
    agents.broadcast({
      type: 'agentStatus',
      id: agentId,
      status: 'waiting',
      // Heuristic text-idle timer: the turn ended without a clear idle signal,
      // so this is "Done", not "Waiting for input".
      awaitingInput: false,
    });
  }, delayMs);
  waitingTimers.set(agentId, timer);
}

export function cancelPermissionTimer(
  agentId: number,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
): void {
  const timer = permissionTimers.get(agentId);
  if (timer) {
    clearTimeout(timer);
    permissionTimers.delete(agentId);
  }
}

export function startPermissionTimer(
  agentId: number,
  agents: AgentStateStore,
  permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
  permissionExemptTools: ReadonlySet<string>,
): void {
  cancelPermissionTimer(agentId, permissionTimers);
  if (!stateGuessingAllowed) return;
  const timer = setTimeout(() => {
    permissionTimers.delete(agentId);
    const agent = agents.get(agentId);
    if (!agent) return;

    // Only flag if there are still active non-exempt tools (parent or sub-agent)
    let hasNonExempt = false;
    for (const toolId of agent.activeToolIds) {
      const toolName = agent.activeToolNames.get(toolId);
      if (!permissionExemptTools.has(toolName || '')) {
        hasNonExempt = true;
        break;
      }
    }

    // Check sub-agent tools for non-exempt tools
    const stuckSubagentParentToolIds: string[] = [];
    for (const [parentToolId, subToolNames] of agent.activeSubagentToolNames) {
      for (const [, toolName] of subToolNames) {
        if (!permissionExemptTools.has(toolName)) {
          stuckSubagentParentToolIds.push(parentToolId);
          hasNonExempt = true;
          break;
        }
      }
    }

    const screen = hasNonExempt ? screenOf(agentId) : undefined;
    if (screen && !screenAsks(screen)) {
      // Still working: look again while the tool runs (a prompt may follow).
      startPermissionTimer(agentId, agents, permissionTimers, permissionExemptTools);
      return;
    }

    if (hasNonExempt) {
      agent.permissionSent = true;
      console.log(`[Pixel Agents] Timer: Agent ${agentId} - possible permission wait detected`);
      agents.broadcast({
        type: 'agentToolPermission',
        id: agentId,
      });
      // Also notify stuck sub-agents
      for (const parentToolId of stuckSubagentParentToolIds) {
        agents.broadcast({
          type: 'subagentToolPermission',
          id: agentId,
          parentToolId,
        });
      }
    }
  }, PERMISSION_TIMER_DELAY_MS);
  permissionTimers.set(agentId, timer);
}
