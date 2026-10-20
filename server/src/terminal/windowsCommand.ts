import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve a bare command name for node-pty on Windows. Unlike a shell,
 * node-pty's Windows backend does not search PATH/PATHEXT, so a bare `claude`
 * fails with "File not found" (measured 2026-10-19 with the native
 * ~/.local/bin/claude.exe on PATH). Batch shims (`claude.cmd` from an npm
 * install) cannot be spawned directly at all and go through cmd.exe.
 *
 * Anything that is not a bare name, or not found, is returned untouched so
 * the spawn fails with node-pty's own error.
 */
export function resolveWindowsCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = fileExists,
): { command: string; args: string[] } {
  if (path.win32.basename(command) !== command) return { command, args };

  const pathDirs = (env.PATH ?? env.Path ?? '').split(';').filter(Boolean);
  const hasExtension = path.win32.extname(command) !== '';
  const extensions = hasExtension
    ? ['']
    : (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const candidate = path.win32.join(dir, command + ext.toLowerCase());
      if (!exists(candidate)) continue;
      if (/\.(cmd|bat)$/i.test(candidate)) {
        return { command: env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', candidate, ...args] };
      }
      return { command: candidate, args };
    }
  }
  return { command, args };
}

/** Characters cmd.exe acts on even inside quotes (or that end the quoting). */
const CMD_UNSAFE = /["%!^&|<>\r\n]/;

/**
 * Whether an argument can ride through `cmd.exe /c <shim.cmd> ...` as plain
 * text. A batch shim's arguments are re-parsed by cmd: a quote ends the
 * quoting, % and ! expand variables, & | < > chain or redirect. Such an
 * argument is refused rather than escaped (cmd escaping is not reliable
 * across the shim's own %* re-expansion).
 */
export function isCmdSafeArgument(arg: string): boolean {
  return !CMD_UNSAFE.test(arg);
}

/** Whether resolveWindowsCommand routed this launch through cmd.exe. */
export function runsThroughCmd(spawnable: { command: string; args: string[] }): boolean {
  return /(^|[\\/])cmd(\.exe)?$/i.test(spawnable.command) && spawnable.args[0] === '/d';
}

/**
 * Kill Claude processes still running a session whose terminal died with a
 * crashed server (measured: on Windows, a hard-killed server leaves its
 * claude.exe children alive and headless). Resuming next to such an orphan
 * would put two processes on one conversation. Returns how many were killed.
 */
export function killOrphanedSession(sessionId: string): number {
  if (process.platform !== 'win32' || !/^[0-9a-f-]{36}$/i.test(sessionId)) return 0;
  // sessionId is validated as a UUID above, so it is safe inside the filter.
  const script =
    `$p = Get-CimInstance Win32_Process -Filter "Name='claude.exe'" | ` +
    `Where-Object { $_.CommandLine -match '${sessionId}' }; ` +
    `$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ` +
    `@($p).Count`;
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf-8',
        timeout: 15_000,
        windowsHide: true,
      },
    );
    return Number.parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
