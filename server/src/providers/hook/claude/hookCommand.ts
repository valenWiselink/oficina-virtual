import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR, PERMISSION_HOOK_TIMEOUT_SEC } from '../../../constants.js';
import { CLAUDE_HOOK_SCRIPT_NAME, HOOK_EXE_ENV, HOOK_EXEC_FLAG } from './constants.js';

/** A single hook entry in Claude Code's ~/.claude/settings.json hooks config. */
export interface ClaudeHookEntry {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
    /** Exec form (no shell): `command` is spawned directly with these. */
    args?: string[];
    timeout?: number;
    /** Claude Code starts the hook and carries on without waiting for it. */
    async?: boolean;
  }>;
}

/** Events the office only listens to: nothing Claude Code does waits on our
 *  answer, so they run in the background (`async`) and a slow hook never
 *  holds a tool up. Measured 2026-10-21: with the desktop app's exe, 27 tool
 *  calls in 18 min were held up to 40 s by these. PermissionRequest (the
 *  office may answer it) and Stop / SessionStart / SessionEnd stay
 *  synchronous; their arrival order is the server's anchor (hookEventOrder). */
export const ASYNC_HOOK_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'TaskCompleted',
  'TeammateIdle',
]);

/** Timeout (seconds) of every synchronous hook but PermissionRequest. */
const HOOK_TIMEOUT_SEC = 5;
/** Oldest Node that runs the compiled hook script (esbuild targets node18). */
const MIN_NODE_MAJOR = 18;
const NODE_VERSION_TIMEOUT_MS = 3000;

/** Returns the destination path for the hook script (~/.pixel-agents/hooks/claude-hook.js). */
export function getHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, CLAUDE_HOOK_SCRIPT_NAME);
}

/** The first `node` executable on a PATH value, or undefined. Windows needs
 *  the real `node.exe`: Git Bash (what Claude Code runs a hook's command
 *  with) does not resolve `node` to a `.cmd` shim. */
export function findNodeOnPath(
  pathValue: string | undefined,
  platform: NodeJS.Platform = process.platform,
  exists: (file: string) => boolean = fs.existsSync,
): string | undefined {
  if (!pathValue) return undefined;
  const win = platform === 'win32';
  const name = win ? 'node.exe' : 'node';
  for (const raw of pathValue.split(win ? ';' : ':')) {
    const dir = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!dir) continue;
    const candidate = win ? path.win32.join(dir, name) : path.posix.join(dir, name);
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** "v24.1.0" -> true when the major version runs the hook script. */
export function isUsableNodeVersion(output: string): boolean {
  const major = /^v?(\d+)\./.exec(output.trim());
  return !!major && Number(major[1]) >= MIN_NODE_MAJOR;
}

const nodeCheckCache = new Map<string, boolean>();

/** Whether a usable `node` is on this process's PATH (the same PATH Claude
 *  Code's hooks see on this PC, as both come from the user's environment).
 *  Checked once per PATH value: it runs `node --version`. */
export function nodeOnPath(env: NodeJS.ProcessEnv = process.env): boolean {
  const pathValue = env.PATH ?? env.Path ?? '';
  const cached = nodeCheckCache.get(pathValue);
  if (cached !== undefined) return cached;
  let usable = false;
  const node = findNodeOnPath(pathValue);
  if (node) {
    try {
      const out = execFileSync(node, ['--version'], {
        encoding: 'utf-8',
        timeout: NODE_VERSION_TIMEOUT_MS,
        windowsHide: true,
      });
      usable = isUsableNodeVersion(out);
    } catch {
      usable = false;
    }
  }
  nodeCheckCache.set(pathValue, usable);
  return usable;
}

/**
 * How Claude Code runs the hook script: `node "<script>"` through Claude
 * Code's shell whenever the PC has a usable Node — a plain Node start is
 * 0.15-0.25 s, while the desktop app's exe starts Electron twice (0.25-0.7 s
 * idle, 3-18 s measured with several agents). Only a PC without Node (the
 * desktop app's own HOOK_EXE_ENV set, no `node` on PATH) gets the exec form:
 * the app runs the script with its own runtime when given HOOK_EXEC_FLAG.
 *
 * The node shape is the one every earlier office version also recognizes as
 * its own, so an older office reinstalling replaces it instead of adding a
 * second copy beside it.
 */
export function makeHookCommand(
  hookExe: string | undefined = process.env[HOOK_EXE_ENV],
  hasNode: () => boolean = nodeOnPath,
): { command: string; args?: string[] } {
  const scriptPath = getHookScriptPath();
  if (hookExe && !hasNode()) return { command: hookExe, args: [HOOK_EXEC_FLAG, scriptPath] };
  return { command: `node "${scriptPath}"` };
}

/** Create a hook entry object for Claude's settings.json. Matcher is empty (catch-all).
 *  PermissionRequest gets a long timeout: its hook waits for a decision from the
 *  office while the terminal prompt stays answerable in parallel. Listen-only
 *  events run in the background (ASYNC_HOOK_EVENTS). */
export function makeHookEntry(event?: string): ClaudeHookEntry {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command',
        ...makeHookCommand(),
        timeout: event === 'PermissionRequest' ? PERMISSION_HOOK_TIMEOUT_SEC : HOOK_TIMEOUT_SEC,
        ...(event !== undefined && ASYNC_HOOK_EVENTS.has(event) ? { async: true } : {}),
      },
    ],
  };
}
