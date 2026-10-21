import { spawn } from 'child_process';

/** First argument of the exec-form hook the server writes into Claude Code's
 *  settings (server/src/providers/hook/claude/constants.ts HOOK_EXEC_FLAG). */
export const HOOK_EXEC_FLAG = '--oficina-hook';

/** Tells the script when Claude Code started this exe (server/src/constants.ts
 *  HOOK_SPAWNED_AT_ENV): the script itself only starts after a second runtime
 *  start, which is where the delay is. */
const HOOK_SPAWNED_AT_ENV = 'OFICINA_HOOK_SPAWNED_AT';

/**
 * Hook mode: Claude Code runs `<this exe> --oficina-hook <claude-hook.js>`
 * for each event (a PC with only the desktop app has no `node`). Run the
 * script with the app's own Node (ELECTRON_RUN_AS_NODE) on the same stdin,
 * stdout and stderr — a PermissionRequest hook answers on stdout — and exit
 * with its code. Returns false when this launch is not a hook.
 */
export function runHookIfAsked(argv: readonly string[]): boolean {
  const at = argv.indexOf(HOOK_EXEC_FLAG);
  if (at < 0) return false;
  const script = argv[at + 1];
  if (!script) process.exit(0);
  const spawnedAt = String(Math.round(Date.now() - process.uptime() * 1000));
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', [HOOK_SPAWNED_AT_ENV]: spawnedAt },
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', () => process.exit(0));
  return true;
}

/** Passed by the uninstaller: take our hooks out of Claude Code's settings
 *  (they would point at the exe being removed) and exit. */
export const UNINSTALL_HOOKS_FLAG = '--oficina-uninstall-hooks';

export function runUninstallIfAsked(argv: readonly string[], cliPath: string): boolean {
  if (!argv.includes(UNINSTALL_HOOKS_FLAG)) return false;
  const child = spawn(process.execPath, [cliPath, '--uninstall-hooks'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', () => process.exit(1));
  return true;
}
