import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import type { PendingPermission } from '../src/permissionBroker.js';
import { PermissionBroker } from '../src/permissionBroker.js';
import { resolvedPermissionMessages } from '../src/permissionMessages.js';
import { createPermissionBroker } from '../src/permissionWiring.js';
import { movedOnSince, survivesRestart, TerminalAsks } from '../src/terminalAsks.js';
import type { AgentState } from '../src/types.js';

const ask = {
  session_id: 'sess-1',
  hook_event_name: 'PermissionRequest',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf build', description: 'Clean' },
};

/** An agent as the store holds it, with the few fields these paths read. */
function agent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    sessionId: 'sess-1',
    permissionSent: true,
    isExternal: false,
    jsonlFile: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    contextTokens: 0,
    ...overrides,
  } as unknown as AgentState;
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-terminal-asks-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PermissionBroker: an expired hold is still asked in the terminal', () => {
  function brokerWithLog(waitMs = 10) {
    const settled: PendingPermission[] = [];
    const broker = new PermissionBroker(
      { onPending: () => {}, onResolved: () => {}, onSettled: (r) => settled.push(r) },
      waitMs,
    );
    return { broker, settled };
  }

  it('keeps an expired request until that call finishes', async () => {
    const { broker, settled } = brokerWithLog();
    await broker.hold(ask);
    expect(broker.askedInTerminal()).toHaveLength(1);
    // Another call of the session finishing settles nothing.
    broker.observe({ ...ask, hook_event_name: 'PostToolUse', tool_input: { command: 'ls' } });
    expect(settled).toHaveLength(0);
    broker.observe({ ...ask, hook_event_name: 'PostToolUse' });
    expect(settled).toHaveLength(1);
    expect(broker.askedInTerminal()).toEqual([]);
  });

  it('settles it on Stop or SessionEnd of the session', async () => {
    const { broker, settled } = brokerWithLog();
    await broker.hold(ask);
    broker.observe({ session_id: 'other', hook_event_name: 'Stop' });
    expect(settled).toHaveLength(0);
    broker.observe({ session_id: 'sess-1', hook_event_name: 'SessionEnd' });
    expect(settled).toHaveLength(1);
  });

  it('turns every held request into a terminal one on shutdown', () => {
    const { broker } = brokerWithLog(60_000);
    void broker.hold(ask);
    broker.dispose();
    expect(broker.pending()).toEqual([]);
    expect(broker.askedInTerminal().map((r) => r.toolName)).toEqual(['Bash']);
  });

  it('a request answered in the office leaves nothing behind', async () => {
    const { broker } = brokerWithLog(60_000);
    const held = broker.hold(ask);
    broker.decide(broker.pending()[0].requestId, { behavior: 'allow' });
    await held;
    expect(broker.askedInTerminal()).toEqual([]);
  });
});

describe('the bubble across an expired hold', () => {
  it('only drops the card when the hold expires', () => {
    const store = new AgentStateStore();
    store.set(7, agent());
    const request = { requestId: 'r1', sessionId: 'sess-1', toolName: 'Bash', toolInput: {} };
    const messages = resolvedPermissionMessages({ ...request, createdAt: 0 }, 'expired', store, []);
    expect(messages).toEqual([
      { type: 'permissionResolved', requestId: 'r1', id: 7, outcome: 'expired' },
    ]);
    expect(store.get(7)?.permissionSent).toBe(true);
  });

  it('clears it when the session settles the request in the terminal', async () => {
    const store = new AgentStateStore();
    store.set(7, agent({ isExternal: true }));
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m) => sent.push(m));
    const { broker } = createPermissionBroker(store);
    // Shorten nothing: dispose ends the hold the same way the timeout does.
    void broker.hold(ask);
    broker.dispose();
    expect(sent.some((m) => m.type === 'agentToolPermissionClear')).toBe(false);
    broker.observe({ ...ask, hook_event_name: 'Stop' });
    expect(sent.at(-1)).toEqual({ type: 'agentToolPermissionClear', id: 7 });
    expect(store.get(7)?.permissionSent).toBe(false);
  });

  it('is replayed to a client that connects (a reload)', () => {
    const store = new AgentStateStore();
    store.set(7, agent({ permissionSince: 1234 }));
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((m) => sent.push(m), store);
    expect(sent).toContainEqual({ type: 'agentToolPermission', id: 7, since: 1234 });
  });
});

describe('movedOnSince', () => {
  const at = (iso: string) => Date.parse(iso);
  const line = (type: string, timestamp: string, extra = {}) =>
    JSON.stringify({ type, timestamp, ...extra });
  const since = at('2026-10-20T14:01:53.000Z');

  it('is false while the session wrote nothing that answers', () => {
    const lines = [
      line('assistant', '2026-10-20T14:01:52.933Z'),
      line('attachment', '2026-10-20T14:05:00.000Z'),
      line('queue-operation', '2026-10-20T14:06:00.000Z'),
    ];
    expect(movedOnSince(lines, since)).toBe(false);
  });

  it('is true once a result, an answer or a turn end came after', () => {
    expect(movedOnSince([line('user', '2026-10-20T14:10:16.014Z')], since)).toBe(true);
    expect(movedOnSince([line('assistant', '2026-10-20T14:10:20.000Z')], since)).toBe(true);
    const end = line('system', '2026-10-20T14:10:30.000Z', { subtype: 'turn_duration' });
    expect(movedOnSince([end], since)).toBe(true);
  });
});

describe('TerminalAsks across a restart', () => {
  const file = () => path.join(tmp, 'permisos-en-terminal.json');
  const transcript = () => path.join(tmp, 'sess-1.jsonl');
  const request: PendingPermission = {
    requestId: 'r1',
    sessionId: 'sess-1',
    toolName: 'Bash',
    toolInput: { command: 'rm -rf build', content: 'x'.repeat(5000) },
    createdAt: Date.now() - 60_000,
  };
  const broker = (asked: PendingPermission[]) => ({
    pending: () => [],
    askedInTerminal: () => asked,
    rememberAskedInTerminal: (r: PendingPermission) => void asked.push(r),
  });

  it('saves only what outlives the office, without huge fields', () => {
    const store = new AgentStateStore();
    store.set(1, agent({ bgId: 'abcd1234' }));
    store.set(2, agent({ sessionId: 'sess-2' }));
    const asks = new TerminalAsks(
      store,
      () => broker([request, { ...request, requestId: 'r2', sessionId: 'sess-2' }]),
      file(),
    );
    asks.save();
    const saved = JSON.parse(fs.readFileSync(file(), 'utf-8')) as PendingPermission[];
    expect(saved.map((s) => s.requestId)).toEqual(['r1']);
    expect(saved[0].toolInput).toEqual({ command: 'rm -rf build' });
  });

  it('does not overwrite the saved asks once frozen (shutdown)', () => {
    const store = new AgentStateStore();
    store.set(1, agent({ bgId: 'abcd1234' }));
    const asks = new TerminalAsks(store, () => broker([request]), file());
    asks.save();
    asks.freeze();
    store.delete(1);
    asks.save();
    expect(JSON.parse(fs.readFileSync(file(), 'utf-8'))).toHaveLength(1);
  });

  it('takes an ask back when its agent returns and its transcript did not move on', async () => {
    fs.writeFileSync(file(), JSON.stringify([request]));
    fs.writeFileSync(
      transcript(),
      JSON.stringify({ type: 'assistant', timestamp: new Date(request.createdAt).toISOString() }) +
        '\n',
    );
    const store = new AgentStateStore();
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m) => sent.push(m));
    const asked: PendingPermission[] = [];
    new TerminalAsks(store, () => broker(asked), file()).start();
    store.set(3, agent({ bgId: 'abcd1234', permissionSent: false, jsonlFile: transcript() }));
    await new Promise((r) => setImmediate(r));
    expect(store.get(3)?.permissionSent).toBe(true);
    // A hook said so: new transcript lines must not clear it as a guess.
    expect(store.get(3)?.hookDelivered).toBe(true);
    expect(sent).toContainEqual({ type: 'agentToolPermission', id: 3, since: request.createdAt });
    expect(asked.map((a) => a.requestId)).toEqual(['r1']);
  });

  it('drops an ask the session answered while the office was down', async () => {
    fs.writeFileSync(file(), JSON.stringify([request]));
    const later = new Date(request.createdAt + 30_000).toISOString();
    fs.writeFileSync(transcript(), JSON.stringify({ type: 'user', timestamp: later }) + '\n');
    const store = new AgentStateStore();
    new TerminalAsks(store, () => broker([]), file()).start();
    store.set(3, agent({ bgId: 'abcd1234', permissionSent: false, jsonlFile: transcript() }));
    await new Promise((r) => setImmediate(r));
    expect(store.get(3)?.permissionSent).toBe(false);
  });

  it('knows whose sessions outlive the office', () => {
    expect(survivesRestart(agent({ bgId: 'abcd1234' }))).toBe(true);
    expect(survivesRestart(agent({ isExternal: true }))).toBe(true);
    expect(survivesRestart(agent())).toBe(false);
  });
});
