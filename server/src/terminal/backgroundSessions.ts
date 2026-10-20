/**
 * Claude Code's background sessions as the office's agents, so restarting or
 * updating the office does not restart them: Claude Code's own supervisor
 * keeps each session alive, and the office's terminal only attaches to it
 * (`claude attach <id>`). Killing that terminal (the office closing) leaves
 * the session running; the office attaches again when it comes back.
 *
 * Measured with Claude Code 2.1.304 on Windows (2026-10-20, no prompt sent):
 * - `claude --bg --name N [flags]` starts an idle session and prints
 *   "backgrounded · <id> · N (idle …)"; --session-id is ignored (Claude picks
 *   it: the short id is its first 8 characters).
 * - `claude agents --json [--all]` lists them: id, sessionId, name, cwd,
 *   kind, state (working | blocked | done | failed | stopped), status, pid.
 * - `claude attach <id>` in a PTY is the full TUI; killing the PTY keeps the
 *   session; attaching again works, also to a done or stopped one.
 * - `claude --resume <sid> --bg [flags]` turns a regular session into a
 *   background one under the same id with those flags — but on a session
 *   that is already a background one it starts a COPY (it keeps its saved
 *   options). So new flags = `stop` + `rm` (the transcript stays) + that.
 * - An untrusted folder is refused: "Workspace not trusted. Run `claude` …".
 */

import { execFile } from 'child_process';

import { agentEnv } from './ptySessionManager.js';
import { resolveWindowsCommand } from './windowsCommand.js';

/** One row of `claude agents --json`. */
export interface BackgroundRow {
  id: string;
  sessionId?: string;
  name?: string;
  cwd?: string;
  kind?: string;
  state?: string;
  status?: string;
  pid?: number;
}

/** The folder was never trusted: a regular `claude` there shows the prompt. */
export class WorkspaceNotTrustedError extends Error {
  constructor(cwd: string) {
    super(`La carpeta ${cwd} todavía no es de confianza para Claude Code`);
  }
}

export type BackgroundRunner = (
  args: string[],
  cwd: string,
) => Promise<{ code: number; out: string }>;

/** How long one `claude` command may take (starting the supervisor is slow). */
const RUN_TIMEOUT_MS = 60_000;

/** `claude <args>` with the agents' clean environment: the supervisor it may
 *  start would otherwise inherit ELECTRON_RUN_AS_NODE from the desktop app
 *  and pass it to every session's hooks ("bad option: --oficina-hook"). */
const defaultRunner: BackgroundRunner = (args, cwd) =>
  new Promise((resolve) => {
    const env = agentEnv(process.env);
    const spawnable =
      process.platform === 'win32'
        ? resolveWindowsCommand('claude', args, env)
        : { command: 'claude', args };
    execFile(
      spawnable.command,
      spawnable.args,
      { cwd, env, timeout: RUN_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ code, out: `${String(stdout ?? '')}${String(stderr ?? '')}` });
      },
    );
  });

let runner: BackgroundRunner = defaultRunner;
/** Off until the office turns it on from its setting (on by default there):
 *  code that launches agents outside the office (tests) never runs `claude`. */
let enabled = false;

/** Tests swap the `claude` runner for a fake. */
export function setBackgroundRunner(next: BackgroundRunner | null): void {
  runner = next ?? defaultRunner;
}

/** The setting (Ajustes): launch agents as background sessions or not. */
export function setBackgroundAgents(on: boolean): void {
  enabled = on;
}

export function backgroundAgentsOn(): boolean {
  return enabled;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** The short id from "backgrounded · 4d1e47e7 · name (idle …)". */
export function parseBackgrounded(out: string): string | undefined {
  return out.match(/backgrounded\s*·\s*([0-9a-f]{8})\b/i)?.[1];
}

export function isUntrusted(out: string): boolean {
  return /workspace not trusted/i.test(out);
}

/** A unique, readable name for the session ("oficina-pagos-3f2a"). */
export function backgroundName(label: string, random: () => number = Math.random): string {
  const slug =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'agente';
  const tag = Math.floor(random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
  return `oficina-${slug}-${tag}`;
}

/**
 * The background form of the office's launch arguments (built by the
 * provider with a leading `--session-id <id>` or `--resume <id>`): a new
 * session drops the id (Claude picks it), a resumed one keeps `--resume`.
 */
export function backgroundArgs(launchArgs: readonly string[], name: string): string[] {
  const [flag, sessionId, ...rest] = launchArgs;
  const base = flag === '--resume' ? ['--resume', sessionId] : [];
  const tail = flag === '--resume' || flag === '--session-id' ? rest : launchArgs.slice();
  return [...base, '--bg', '--name', name, ...tail];
}

export function parseRows(out: string): BackgroundRow[] {
  try {
    const start = out.indexOf('[');
    const parsed = JSON.parse(start >= 0 ? out.slice(start) : out) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (r): r is BackgroundRow =>
            typeof r === 'object' && r !== null && typeof (r as BackgroundRow).id === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

// ── Commands ───────────────────────────────────────────────────────────────

/** Every background session (finished and stopped ones too). */
export async function listBackground(cwd = process.cwd()): Promise<BackgroundRow[]> {
  const { code, out } = await runner(['agents', '--json', '--all'], cwd);
  return code === 0
    ? parseRows(out).filter((r) => r.kind === undefined || r.kind === 'background')
    : [];
}

export async function findBackground(id: string, cwd?: string): Promise<BackgroundRow | undefined> {
  return (await listBackground(cwd)).find((r) => r.id === id);
}

export async function findBackgroundBySession(
  sessionId: string,
  cwd?: string,
): Promise<BackgroundRow | undefined> {
  return (await listBackground(cwd)).find((r) => r.sessionId === sessionId);
}

/**
 * Start a background session (args from backgroundArgs). Resolves with its
 * short id and session id; throws WorkspaceNotTrustedError for an untrusted
 * folder and a plain Error for anything else.
 */
export async function startBackground(
  cwd: string,
  args: string[],
): Promise<{ bgId: string; sessionId: string }> {
  const { code, out } = await runner(args, cwd);
  if (isUntrusted(out)) throw new WorkspaceNotTrustedError(cwd);
  const bgId = parseBackgrounded(out);
  if (code !== 0 || !bgId) throw new Error(out.trim() || `claude --bg salió con ${code}`);
  // The full session id: the listing has it as soon as the session exists.
  for (let tries = 0; tries < 5; tries++) {
    const row = await findBackground(bgId, cwd);
    if (row?.sessionId) return { bgId, sessionId: row.sessionId };
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No encontré la sesión ${bgId} en claude agents`);
}

/** Stop a session and (by default) take it off the list; its transcript stays. */
export async function stopBackground(id: string, cwd?: string, remove = true): Promise<void> {
  const where = cwd ?? process.cwd();
  await runner(['stop', id], where);
  if (remove) await runner(['rm', id], where);
}

/** What the office's terminal runs to show a background session. */
export function attachCommand(bgId: string): { command: string; args: string[] } {
  const args = ['attach', bgId];
  return process.platform === 'win32'
    ? resolveWindowsCommand('claude', args)
    : { command: 'claude', args };
}
