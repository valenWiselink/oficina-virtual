import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingPermission, PermissionOutcome } from '../src/permissionBroker.js';

// Isolated temp HOME for the in-process server (writes nothing here today, but
// a stray write must never reach the operator's real ~/.pixel-agents).
let tmpBase: string;

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => tmpBase };
});

const { PermissionBroker } = await import('../src/permissionBroker.js');
const { createHttpServer } = await import('../src/httpServer.js');
const { AgentStateStore } = await import('../src/agentStateStore.js');
const { resolvedPermissionMessages } = await import('../src/permissionMessages.js');

const HOOK_SCRIPT = path.join(__dirname, '../../dist/hooks/claude-hook.js');
const TOKEN = 'test-token';

const permissionEvent = {
  session_id: 'sess-1',
  hook_event_name: 'PermissionRequest',
  tool_name: 'PowerShell',
  tool_input: { command: 'mkdir carpeta-prueba', description: 'Create dir' },
  cwd: 'F:\\proyectos\\demo',
};

function recordingBroker(waitMs?: number) {
  const pending: PendingPermission[] = [];
  const resolved: Array<{ requestId: string; outcome: PermissionOutcome }> = [];
  const broker = new PermissionBroker(
    {
      onPending: (r) => pending.push(r),
      onResolved: (r, outcome) => resolved.push({ requestId: r.requestId, outcome }),
    },
    waitMs,
  );
  return { broker, pending, resolved };
}

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-permission-test-'));
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

describe('PermissionBroker', () => {
  it('resolves with the office decision and reports it', async () => {
    const { broker, pending, resolved } = recordingBroker();
    const held = broker.hold(permissionEvent);
    expect(pending).toHaveLength(1);
    expect(pending[0].toolInput).toEqual(permissionEvent.tool_input);

    expect(broker.decide(pending[0].requestId, { behavior: 'allow' })).toBe(true);
    await expect(held).resolves.toEqual({ behavior: 'allow' });
    expect(resolved).toEqual([{ requestId: pending[0].requestId, outcome: 'allow' }]);
    expect(broker.pending()).toEqual([]);
  });

  it('refuses a decision for a request that is already gone', async () => {
    const { broker, pending } = recordingBroker();
    const held = broker.hold(permissionEvent);
    broker.sessionSettled('sess-1');
    await expect(held).resolves.toBeNull();
    expect(broker.decide(pending[0].requestId, { behavior: 'allow' })).toBe(false);
  });

  it('never holds a question (AskUserQuestion is answered, not approved)', async () => {
    const { broker, pending } = recordingBroker();
    const asked = {
      ...permissionEvent,
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [] },
    };
    await expect(broker.hold(asked)).resolves.toBeNull();
    expect(pending).toEqual([]);
  });

  it('ends a request when the finished call carries extra fields (answered in the terminal)', async () => {
    const { broker, resolved } = recordingBroker();
    const held = broker.hold(permissionEvent);
    broker.observe({
      session_id: 'sess-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'PowerShell',
      tool_input: { ...permissionEvent.tool_input, timeout: 120000 },
    });
    await expect(held).resolves.toBeNull();
    expect(resolved[0].outcome).toBe('terminal');
  });

  it('ends a request when that exact tool call finished (answered in the terminal)', async () => {
    const { broker, resolved } = recordingBroker();
    const held = broker.hold(permissionEvent);
    broker.observe({
      session_id: 'sess-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'PowerShell',
      tool_input: { ...permissionEvent.tool_input },
    });
    await expect(held).resolves.toBeNull();
    expect(resolved[0].outcome).toBe('terminal');
  });

  it('keeps a request when another call of the same session finished (parallel subagent)', () => {
    const { broker } = recordingBroker();
    void broker.hold(permissionEvent);
    broker.observe({
      session_id: 'sess-1',
      hook_event_name: 'PostToolUse',
      tool_name: 'PowerShell',
      tool_input: { command: 'git status' },
    });
    broker.observe({ session_id: 'sess-2', hook_event_name: 'Stop' });
    expect(broker.pending()).toHaveLength(1);
  });

  it('ends every request of a session on Stop or SessionEnd', async () => {
    const { broker } = recordingBroker();
    const a = broker.hold(permissionEvent);
    const b = broker.hold({ ...permissionEvent, tool_name: 'Write' });
    broker.observe({ session_id: 'sess-1', hook_event_name: 'Stop' });
    await expect(Promise.all([a, b])).resolves.toEqual([null, null]);
  });

  it('ends a request when the hook went away', async () => {
    const { broker, resolved } = recordingBroker();
    const gone = new AbortController();
    const held = broker.hold(permissionEvent, gone.signal);
    gone.abort();
    await expect(held).resolves.toBeNull();
    expect(resolved[0].outcome).toBe('terminal');
  });

  it('expires a request nobody answered', async () => {
    const { broker, resolved } = recordingBroker(20);
    await expect(broker.hold(permissionEvent)).resolves.toBeNull();
    expect(resolved[0].outcome).toBe('expired');
  });

  it('does not hold a request without a session or a tool', async () => {
    const { broker, pending } = recordingBroker();
    await expect(broker.hold({ hook_event_name: 'PermissionRequest' })).resolves.toBeNull();
    expect(pending).toEqual([]);
  });

  it('releases everything on dispose', async () => {
    const { broker } = recordingBroker();
    const held = broker.hold(permissionEvent);
    broker.dispose();
    await expect(held).resolves.toBeNull();
  });
});

describe('resolvedPermissionMessages', () => {
  function storeWithAgent(): InstanceType<typeof AgentStateStore> {
    const store = new AgentStateStore();
    store.set(7, { sessionId: 'sess-1', permissionSent: true } as never);
    return store;
  }
  const request = {
    requestId: 'r1',
    sessionId: 'sess-1',
    toolName: 'Bash',
    toolInput: {},
    createdAt: 0,
  };

  it("drops the card and the character's Needs approval bubble", () => {
    const store = storeWithAgent();
    expect(resolvedPermissionMessages(request, 'allow', store, [])).toEqual([
      { type: 'permissionResolved', requestId: 'r1', id: 7, outcome: 'allow' },
      { type: 'agentToolPermissionClear', id: 7 },
    ]);
    expect(store.get(7)?.permissionSent).toBe(false);
  });

  it('keeps the bubble while the same session still has a request waiting', () => {
    const store = storeWithAgent();
    const other = { ...request, requestId: 'r2' };
    const messages = resolvedPermissionMessages(request, 'terminal', store, [other]);
    expect(messages.map((m) => m.type)).toEqual(['permissionResolved']);
  });
});

// ── Hook script against fake servers ────────────────────────────

/** A server that answers every POST with `reply` after `delayMs`. */
function startReplyingServer(
  reply: string,
  delayMs = 0,
): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () =>
      setTimeout(() => {
        res.writeHead(200);
        res.end(reply);
      }, delayMs),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

function writeRegistryEntry(port: number): void {
  const dir = path.join(tmpBase, '.pixel-agents', 'servers');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${process.pid}-${port}.json`),
    JSON.stringify({
      port,
      pid: process.pid,
      token: TOKEN,
      startedAt: Date.now(),
      servesSpa: false,
      protocol: 1,
    }),
  );
}

function runHook(stdin: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK_SCRIPT], {
      env: { ...process.env, HOME: tmpBase, USERPROFILE: tmpBase },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.end(stdin);
  });
}

describe('claude-hook.js PermissionRequest', () => {
  const servers: Array<{ close: () => void }> = [];
  afterEach(() => servers.splice(0).forEach((s) => s.close()));

  async function serve(reply: string, delayMs = 0): Promise<void> {
    const s = await startReplyingServer(reply, delayMs);
    servers.push(s);
    writeRegistryEntry(s.port);
  }

  it('prints an allow decision in Claude Code format', async () => {
    await serve(JSON.stringify({ decision: { behavior: 'allow' } }));
    const { code, stdout } = await runHook(JSON.stringify(permissionEvent));
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
  });

  it('prints a deny with its message', async () => {
    await serve(JSON.stringify({ decision: { behavior: 'deny', message: 'no' } }));
    const { stdout } = await runHook(JSON.stringify(permissionEvent));
    expect(JSON.parse(stdout).hookSpecificOutput.decision).toEqual({
      behavior: 'deny',
      message: 'no',
    });
  });

  it('prints nothing when no server decides (terminal prompt keeps the say)', async () => {
    await serve('ok');
    await serve('{"decision":{"behavior":"maybe"}}');
    const { code, stdout } = await runHook(JSON.stringify(permissionEvent));
    expect(code).toBe(0);
    expect(stdout).toBe('');
  });

  it('takes the decision from whichever server has one', async () => {
    await serve('ok');
    await serve(JSON.stringify({ decision: { behavior: 'allow' } }), 200);
    const { stdout } = await runHook(JSON.stringify(permissionEvent));
    expect(JSON.parse(stdout).hookSpecificOutput.decision.behavior).toBe('allow');
  });

  it('never prints for other events, even if a server replies with a decision', async () => {
    await serve(JSON.stringify({ decision: { behavior: 'allow' } }));
    const { stdout } = await runHook(
      JSON.stringify({ ...permissionEvent, hook_event_name: 'PreToolUse' }),
    );
    expect(stdout).toBe('');
  });
});

// ── HTTP route with the broker ──────────────────────────────────

function post(port: number, body: unknown): { reply: Promise<string>; abort: () => void } {
  const payload = JSON.stringify(body);
  let req!: http.ClientRequest;
  const reply = new Promise<string>((resolve, reject) => {
    req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/hooks/claude',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${TOKEN}`,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c: Buffer) => (text += c.toString()));
        res.on('end', () => resolve(text));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
  return { reply, abort: () => req.destroy() };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

describe('hook route with a PermissionBroker', () => {
  it('holds the request and answers with the office decision', async () => {
    const { broker, pending } = recordingBroker();
    const { app, port } = await createHttpServer({
      embedded: true,
      token: TOKEN,
      store: new AgentStateStore(),
      permissionBroker: broker,
    });
    try {
      const { reply } = post(port, permissionEvent);
      await until(() => pending.length === 1);
      broker.decide(pending[0].requestId, { behavior: 'deny', message: 'desde la oficina' });
      expect(JSON.parse(await reply)).toEqual({
        decision: { behavior: 'deny', message: 'desde la oficina' },
      });
    } finally {
      await app.close();
    }
  });

  it('drops the card when the hook connection closes first', async () => {
    const { broker, pending, resolved } = recordingBroker();
    const { app, port } = await createHttpServer({
      embedded: true,
      token: TOKEN,
      store: new AgentStateStore(),
      permissionBroker: broker,
    });
    try {
      const { reply, abort } = post(port, permissionEvent);
      reply.catch(() => {});
      await until(() => pending.length === 1);
      abort();
      await until(() => resolved.length === 1);
      expect(resolved[0].outcome).toBe('terminal');
    } finally {
      await app.close();
    }
  });

  it('settles a held request from a later hook event of the same session', async () => {
    const { broker, pending } = recordingBroker();
    const { app, port } = await createHttpServer({
      embedded: true,
      token: TOKEN,
      store: new AgentStateStore(),
      permissionBroker: broker,
    });
    try {
      const { reply } = post(port, permissionEvent);
      await until(() => pending.length === 1);
      await post(port, { session_id: 'sess-1', hook_event_name: 'Stop' }).reply;
      expect(await reply).toBe('ok');
    } finally {
      await app.close();
    }
  });
});
