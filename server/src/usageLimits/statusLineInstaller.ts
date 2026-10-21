import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../constants.js';
import {
  type ClaudeSettings,
  mutateClaudeSettings,
  readClaudeSettings,
} from '../providers/hook/claude/claudeHookInstaller.js';
import { HOOK_EXE_ENV } from '../providers/hook/claude/constants.js';

/**
 * The office's status line in ~/.claude/settings.json: the documented way to
 * read the plan's usage limits (https://code.claude.com/docs/en/statusline).
 * Installed only when the user turns the limits on; never over a status line
 * of their own (`statusLine` is a single command, theirs wins).
 *
 * Claude Code runs the command through Git Bash or PowerShell, so it points
 * at a small wrapper both can run, by `~` path (no spaces to quote): a .cmd
 * on Windows, a .sh elsewhere. The wrapper runs the script with the runtime
 * the office itself runs on — Node, or the desktop app's exe as Node, ONE
 * process (the hook relay starts Electron twice).
 */
export const STATUS_LINE_SCRIPT_NAME = 'statusline.js';

const WRAPPER_NAME = process.platform === 'win32' ? 'statusline.cmd' : 'statusline.sh';

/** The settings.json `statusLine.command` the office writes. */
export const STATUS_LINE_COMMAND = `~/${HOOK_SCRIPTS_DIR}/${WRAPPER_NAME}`;

/** What ~/.claude/settings.json has as status line: none, ours, the user's
 *  own, or unknown (the file cannot be read). */
export type StatusLineSetup = 'off' | 'ours' | 'foreign' | 'unknown';

/** Thrown by installStatusLine when the user already has a status line. */
export const FOREIGN_STATUS_LINE_MESSAGE = 'Claude Code ya tiene una barra de estado tuya';

/** Ours = a command ending in our wrapper's path, whatever the quoting,
 *  slashes or casing (Windows paths are case-insensitive). */
export function isOurStatusLine(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const command = (value as { command?: unknown }).command;
  if (typeof command !== 'string') return false;
  const normalized = command
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
  return /\/\.pixel-agents\/hooks\/statusline\.(cmd|sh)$/.test(normalized);
}

export function statusLineSetup(): StatusLineSetup {
  let settings: ClaudeSettings;
  try {
    settings = readClaudeSettings();
  } catch {
    return 'unknown';
  }
  const value = settings.statusLine;
  if (value === undefined || value === null) return 'off';
  return isOurStatusLine(value) ? 'ours' : 'foreign';
}

/** Point Claude Code's status line at ours. Refuses (throws) over the
 *  user's own, and over a settings.json it cannot parse. */
export async function installStatusLine(): Promise<void> {
  await mutateClaudeSettings((settings) => {
    const current = settings.statusLine;
    if (current !== undefined && current !== null && !isOurStatusLine(current)) {
      throw new Error(FOREIGN_STATUS_LINE_MESSAGE);
    }
    const next = { type: 'command', command: STATUS_LINE_COMMAND, padding: 0 };
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    settings.statusLine = next;
    return true;
  });
}

/** Take our status line out; the user's own is never touched. */
export async function uninstallStatusLine(): Promise<void> {
  await mutateClaudeSettings((settings) => {
    if (!isOurStatusLine(settings.statusLine)) return false;
    delete settings.statusLine;
    return true;
  });
}

/** The runtime the wrapper starts: the desktop app's exe when the office runs
 *  inside it (as Node, via ELECTRON_RUN_AS_NODE), else this Node. */
function runtimePath(): string {
  return process.env[HOOK_EXE_ENV] || process.execPath;
}

/** The wrapper's text. Batch needs `%` doubled; sh gets single quotes. */
export function wrapperScript(
  runtime: string,
  script: string,
  platform = process.platform,
): string {
  if (platform === 'win32') {
    const q = (p: string) => `"${p.replace(/%/g, '%%')}"`;
    return [
      '@echo off',
      "rem Oficina virtual: hands Claude Code's usage limits to the office.",
      'set ELECTRON_RUN_AS_NODE=1',
      `${q(runtime)} ${q(script)}`,
      '',
    ].join('\r\n');
  }
  const q = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
  return `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${q(runtime)} ${q(script)}\n`;
}

/**
 * Copy the bundled script to ~/.pixel-agents/hooks/ and (re)write the wrapper
 * for the current runtime. Run before installing and on every start while
 * ours is installed, so an update or a moved Node is picked up. False when
 * the script is missing or a write fails (callers then do not install).
 */
export function writeStatusLineFiles(packageRoot: string, runtime = runtimePath()): boolean {
  const src = path.join(packageRoot, 'dist', 'hooks', STATUS_LINE_SCRIPT_NAME);
  const dir = path.join(os.homedir(), HOOK_SCRIPTS_DIR);
  const script = path.join(dir, STATUS_LINE_SCRIPT_NAME);
  try {
    if (!fs.existsSync(src)) {
      console.warn(`[Pixel Agents] Status line script not found at ${src}`);
      return false;
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(src, script);
    const wrapper = path.join(dir, WRAPPER_NAME);
    fs.writeFileSync(wrapper, wrapperScript(runtime, script), 'utf-8');
    fs.chmodSync(wrapper, 0o755);
    return true;
  } catch (e) {
    console.error(`[Pixel Agents] Failed to write the status line files: ${e}`);
    return false;
  }
}
