import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import {
  HOOK_API_PREFIX,
  PERMISSION_HOOK_HTTP_TIMEOUT_MS,
  SERVER_JSON_DIR,
  SERVER_JSON_NAME,
  SERVERS_DIR,
} from '../../../../constants.js';
import type { ServerConfig, ServerTarget } from '../../../../serverConfig.js';
import { isServerConfig, isServerTarget } from '../../../../serverConfig.js';

/** Fire-and-forget events: the server answers 'ok' immediately. */
const HOOK_POST_TIMEOUT_MS = 2000;

const SERVER_JSON = path.join(os.homedir(), SERVER_JSON_DIR, SERVER_JSON_NAME);
const SERVERS_REGISTRY_DIR = path.join(os.homedir(), SERVER_JSON_DIR, SERVERS_DIR);

/**
 * CI / e2e diagnostic: when PIXEL_AGENTS_DEBUG_LOG is set, record the hook
 * script's outcome at every exit point. The hook delivery chain (spawn
 * claude-hook.js -> read the registry -> POST to every live server) is
 * otherwise 100% silent: every failure path resolves quietly, so a dropped
 * hook is invisible in CI. Logging here lets a failing run show exactly
 * where delivery dies (bad-stdin, no-server-json, per-server POST
 * error/timeout/status). Zero cost when the env var is unset.
 */
// Env var is the primary source, but it doesn't reliably reach this spawned
// process across platforms (macOS VS Code terminal profiles with
// inheritEnv:false, etc.). After reading the registry we fall back to a
// live server's `debugLog` field, which the server populated from the same
// env var.
let debugLogPath = process.env['PIXEL_AGENTS_DEBUG_LOG'];
function hookDebug(line: string): void {
  if (!debugLogPath) return;
  try {
    fs.appendFileSync(debugLogPath, `${new Date().toISOString()} HOOKSCRIPT ${line}\n`);
  } catch {
    /* never let diagnostics break the hook */
  }
}

/** True if a process with this PID is alive. Best-effort: a false positive on
 *  PID reuse just costs one extra, harmless, failed POST -- never a crash. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enumerate every live registry entry under ~/.pixel-agents/servers/, so the
 * event can fan out to each running server (VS Code embedded + a standalone
 * `npx pixel-agents`, or several of either, all at once). Entries whose owning
 * PID is no longer alive are skipped (the owning server prunes its own stale
 * file on next start; this script only needs to not POST to it). Returns an
 * empty array when the directory is absent/empty/unreadable -- the caller
 * falls back to the legacy single-target server.json (forward-compat with a
 * server that predates the registry).
 */
function readRegistry(): ServerConfig[] {
  let files: string[];
  try {
    files = fs.readdirSync(SERVERS_REGISTRY_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const live: ServerConfig[] = [];
  for (const file of files) {
    const filePath = path.join(SERVERS_REGISTRY_DIR, file);
    try {
      const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      if (!isServerConfig(entry)) {
        hookDebug(`registry-skip reason=malformed file=${file} err=invalid-server-config`);
        continue;
      }
      if (isProcessAlive(entry.pid)) {
        live.push(entry);
      } else {
        hookDebug(`registry-skip reason=dead-pid file=${file} pid=${entry.pid}`);
      }
    } catch (e) {
      hookDebug(
        `registry-skip reason=malformed file=${file} err=${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return live;
}

/** A permission decision as Claude Code expects it under hookSpecificOutput. */
type PermissionDecision = { behavior: 'allow' } | { behavior: 'deny'; message?: string };

/** Parse a server reply into a decision. Anything that is not exactly an
 *  allow/deny (plain 'ok', `{}`, garbage) means "no decision": the hook then
 *  prints nothing and the terminal prompt keeps the say. */
function parseDecision(raw: string): PermissionDecision | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const decision = (parsed as { decision?: unknown }).decision;
  if (typeof decision !== 'object' || decision === null) return null;
  const { behavior, message } = decision as { behavior?: unknown; message?: unknown };
  if (behavior === 'allow') return { behavior: 'allow' };
  if (behavior !== 'deny') return null;
  return typeof message === 'string' && message.length > 0
    ? { behavior: 'deny', message }
    : { behavior: 'deny' };
}

/**
 * POST one hook event to one server and resolve with the reply body ('' on any
 * failure). Best-effort: every failure path (bad connection, timeout, non-2xx
 * status) resolves quietly -- a dropped delivery to one server must never
 * affect delivery to any other server, nor the script's exit code.
 */
function postToServer(
  server: ServerTarget,
  body: string,
  eventName: string,
  sid: string,
  timeoutMs: number,
): Promise<string> {
  hookDebug(`POST event=${eventName} sid=${sid} port=${server.port}`);
  return new Promise((resolve) => {
    try {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.port,
          path: `${HOOK_API_PREFIX}/claude`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Authorization: `Bearer ${server.token}`,
          },
          timeout: timeoutMs,
        },
        (res) => {
          hookDebug(
            `POST-done event=${eventName} sid=${sid} status=${res.statusCode} port=${server.port}`,
          );
          let reply = '';
          res.setEncoding('utf-8');
          res.on('data', (chunk: string) => (reply += chunk));
          res.on('end', () => resolve(res.statusCode === 200 ? reply : ''));
          res.on('error', () => resolve(''));
        },
      );
      req.on('error', (err) => {
        hookDebug(
          `POST-error event=${eventName} sid=${sid} port=${server.port} err=${err.message}`,
        );
        resolve('');
      });
      req.on('timeout', () => {
        hookDebug(`POST-timeout event=${eventName} sid=${sid} port=${server.port}`);
        req.destroy();
        resolve('');
      });
      req.end(body);
    } catch (err) {
      hookDebug(
        `POST-error event=${eventName} sid=${sid} port=${server.port} err=${err instanceof Error ? err.message : String(err)}`,
      );
      resolve('');
    }
  });
}

/**
 * PermissionRequest: wait for the first server that returns a decision and
 * print it. Servers answering "no decision" (no office open, request answered
 * in the terminal, hold expired) are skipped; if none decides, nothing is
 * printed and Claude Code keeps its own prompt — which it shows in parallel
 * from the start, so the user is never blocked on the office.
 */
async function deliverPermissionRequest(
  servers: ServerTarget[],
  body: string,
  sid: string,
): Promise<void> {
  const decision = await new Promise<PermissionDecision | null>((resolve) => {
    let pending = servers.length;
    for (const server of servers) {
      void postToServer(
        server,
        body,
        'PermissionRequest',
        sid,
        PERMISSION_HOOK_HTTP_TIMEOUT_MS,
      ).then((reply) => {
        const parsed = parseDecision(reply);
        if (parsed) resolve(parsed);
        else if (--pending === 0) resolve(null);
      });
    }
  });
  hookDebug(`permission sid=${sid} result=${decision?.behavior ?? 'no-decision'}`);
  if (!decision) return;
  const output = JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision },
  });
  await new Promise<void>((resolve) => process.stdout.write(output, () => resolve()));
}

async function main(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    hookDebug('exit reason=bad-stdin');
    process.exit(0);
  }

  const eventName = (data.hook_event_name as string | undefined) ?? '?';
  const sid = (data.session_id as string | undefined)?.slice(0, 8) ?? '?';

  // Multi-server fan-out (D4): deliver to every live server in the registry.
  // Falls back to the single legacy server.json when the registry has no live
  // entries -- e.g. a server on disk that predates the registry (A1/A2).
  let servers: ServerTarget[] = readRegistry();
  if (servers.length === 0) {
    try {
      const legacy = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf-8')) as unknown;
      if (!isServerTarget(legacy)) {
        throw new Error('invalid legacy server config');
      }
      servers = [legacy];
    } catch (e) {
      hookDebug(
        `exit reason=no-server-json event=${eventName} sid=${sid} path=${SERVER_JSON} err=${e instanceof Error ? e.message : String(e)}`,
      );
      process.exit(0);
    }
  }

  // Adopt the first live server's debug-log path if the env var didn't reach
  // us (diagnostic-only; harmless if more than one server has it set).
  if (!debugLogPath) {
    const withDebugLog = servers.find((s) => s.debugLog);
    if (withDebugLog?.debugLog) debugLogPath = withDebugLog.debugLog;
  }

  const body = JSON.stringify(data);
  if (eventName === 'PermissionRequest') {
    await deliverPermissionRequest(servers, body, sid);
    return;
  }
  await Promise.all(
    servers.map((server) => postToServer(server, body, eventName, sid, HOOK_POST_TIMEOUT_MS)),
  );
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
