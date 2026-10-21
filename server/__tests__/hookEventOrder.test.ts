import { beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { HOOK_SPAWNED_AT_FIELD } from '../src/constants.js';
import { HookEventHandler } from '../src/hookEventHandler.js';
import { HookEventOrder } from '../src/hookEventOrder.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { SessionRouter } from '../src/sessionRouter.js';
import type { AgentState } from '../src/types.js';

/** A hook event as the script posts it, stamped `at` ms. */
function ev(name: string, at: number, extra: Record<string, unknown> = {}) {
  return { hook_event_name: name, session_id: 'sess-1', [HOOK_SPAWNED_AT_FIELD]: at, ...extra };
}

describe('HookEventOrder', () => {
  const now = 10_000;
  let order: HookEventOrder;
  beforeEach(() => {
    order = new HookEventOrder(() => now);
  });

  it('drops a tool start that arrives after its own end', () => {
    expect(order.admit(1, ev('PostToolUse', 200, { tool_use_id: 'toolu_A' }))).toBe(true);
    expect(order.admit(1, ev('PreToolUse', 100, { tool_use_id: 'toolu_A' }))).toBe(false);
    expect(order.admit(1, ev('PreToolUse', 300, { tool_use_id: 'toolu_B' }))).toBe(true);
  });

  it('drops a tool start from a turn that already ended', () => {
    order.admit(1, ev('Stop', 500));
    expect(order.admit(1, ev('PreToolUse', 400, { tool_use_id: 'toolu_A' }))).toBe(false);
    // The next turn's tools started after the Stop: they count.
    expect(order.admit(1, ev('PreToolUse', 600, { tool_use_id: 'toolu_B' }))).toBe(true);
  });

  it('drops an idle notice overtaken by new work', () => {
    order.admit(1, ev('PreToolUse', 700, { tool_use_id: 'toolu_A' }));
    expect(order.admit(1, ev('Notification', 650, { notification_type: 'idle_prompt' }))).toBe(
      false,
    );
    expect(order.admit(1, ev('Notification', 800, { notification_type: 'idle_prompt' }))).toBe(
      true,
    );
  });

  it('drops a permission notice about a call that already ended', () => {
    order.admit(1, ev('PostToolUse', 900, { tool_use_id: 'toolu_A' }));
    const late = ev('Notification', 850, { notification_type: 'permission_prompt' });
    expect(order.admit(1, late)).toBe(false);
  });

  it('drops a subagent start after its stop', () => {
    order.admit(1, ev('SubagentStop', 300, { agent_id: 'sub-1' }));
    expect(order.admit(1, ev('SubagentStart', 200, { agent_id: 'sub-1' }))).toBe(false);
  });

  it('keeps the agents apart', () => {
    order.admit(1, ev('Stop', 500));
    expect(order.admit(2, ev('PreToolUse', 400, { tool_use_id: 'toolu_A' }))).toBe(true);
  });

  it('uses arrival time for an event with no stamp, and never a future stamp', () => {
    expect(order.stampOf({ hook_event_name: 'Stop' })).toBe(now);
    expect(order.stampOf(ev('Stop', now + 5000))).toBe(now);
    expect(order.stampOf(ev('Stop', 1234))).toBe(1234);
  });

  it('knows a late start belongs to the call whose permission is pending', () => {
    order.admit(1, ev('PermissionRequest', 500));
    expect(order.startedBeforePermission(1, ev('PreToolUse', 450))).toBe(true);
    expect(order.startedBeforePermission(1, ev('PreToolUse', 550))).toBe(false);
    order.admit(1, ev('Stop', 600));
    expect(order.startedBeforePermission(1, ev('PreToolUse', 450))).toBe(false);
  });
});

/** Minimal AgentState for the handler. */
function testAgent(): AgentState {
  return {
    id: 1,
    sessionId: 'sess-1',
    isExternal: true,
    projectDir: '/test',
    jsonlFile: '/test/session.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
  } as unknown as AgentState;
}

describe('HookEventHandler with background hooks out of order', () => {
  let agents: AgentStateStore;
  let sent: Array<Record<string, unknown>>;
  let handler: HookEventHandler;
  let agent: AgentState;

  beforeEach(() => {
    agents = new AgentStateStore();
    sent = [];
    agents.on('broadcast', (msg) => sent.push(msg));
    handler = new HookEventHandler(
      agents,
      new Map(),
      new Map(),
      claudeProvider,
      new SessionRouter(),
    );
    agent = testAgent();
    agents.set(1, agent);
    handler.registerAgent('sess-1', 1);
  });

  const read = { tool_name: 'Read', tool_input: { file_path: '/a.ts' } };

  it('pairs a start and an end by the call id, whatever arrives first', () => {
    handler.handleEvent('claude', ev('PostToolUse', 200, { ...read, tool_use_id: 'toolu_A' }));
    handler.handleEvent('claude', ev('PreToolUse', 100, { ...read, tool_use_id: 'toolu_A' }));
    expect(sent.filter((m) => m.type === 'agentToolStart')).toHaveLength(0);
    expect(sent.filter((m) => m.type === 'agentStatus' && m.status === 'active')).toHaveLength(0);
  });

  it('marks done the very call that ended, not the latest one started', () => {
    handler.handleEvent('claude', ev('PreToolUse', 100, { ...read, tool_use_id: 'toolu_A' }));
    handler.handleEvent('claude', ev('PreToolUse', 110, { ...read, tool_use_id: 'toolu_B' }));
    handler.handleEvent('claude', ev('PostToolUse', 120, { ...read, tool_use_id: 'toolu_A' }));
    const done = sent.filter((m) => m.type === 'agentToolDone').map((m) => m.toolId);
    expect(done).toEqual(['hook-toolu_A']);
  });

  it('does not wake a finished agent with its last tool start arriving late', () => {
    handler.handleEvent('claude', ev('Stop', 500));
    expect(agent.isWaiting).toBe(true);
    handler.handleEvent('claude', ev('PreToolUse', 400, { ...read, tool_use_id: 'toolu_A' }));
    expect(agent.isWaiting).toBe(true);
    expect(sent.at(-1)).toMatchObject({ type: 'agentStatus', status: 'waiting' });
  });

  it('keeps the permission up when the asking call starts late', () => {
    handler.handleEvent('claude', ev('PermissionRequest', 500, { tool_name: 'Bash' }));
    handler.handleEvent('claude', ev('PreToolUse', 450, { tool_name: 'Bash', tool_use_id: 'b' }));
    expect(agent.permissionSent).toBe(true);
    const start = sent.find((m) => m.type === 'agentToolStart');
    expect(start).toMatchObject({ toolId: 'hook-b', permissionActive: true });
  });

  it('a new call after the permission clears it as before', () => {
    handler.handleEvent('claude', ev('PermissionRequest', 500, { tool_name: 'Bash' }));
    handler.handleEvent('claude', ev('PreToolUse', 600, { ...read, tool_use_id: 'r' }));
    expect(agent.permissionSent).toBe(false);
    expect(sent.find((m) => m.type === 'agentToolStart')?.permissionActive).toBeUndefined();
  });
});
