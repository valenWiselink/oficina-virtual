/**
 * "Open" a path clicked in an agent's terminal: a folder opens in the
 * Explorer, a file is shown selected in its folder. Never run: terminal text
 * is untrusted (an agent can print the path of a .bat), so a click must not
 * execute anything. Windows only, like the folder picker.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * explorer.exe's command line: the folder itself, or the file to select. It
 * is passed verbatim with the path in quotes, the one form explorer reads
 * right: Node's own quoting wraps the whole "/select,…" and a path with
 * spaces then opened Documents instead (measured 2026-10-20). A Windows path
 * cannot contain a quote, so nothing escapes it.
 */
export function explorerArgs(target: string, isDirectory: boolean): string[] {
  return isDirectory ? [`"${target}"`] : [`/select,"${target}"`];
}

/** Open it if it is an existing absolute path; false when it was refused. */
export function openInExplorer(target: unknown): boolean {
  if (process.platform !== 'win32' || typeof target !== 'string') return false;
  const clean = path.win32.normalize(target.trim());
  // A drive path only (C:\…): no UNC shares, no device paths.
  if (!/^[A-Za-z]:\\/.test(clean)) return false;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(clean);
  } catch {
    return false;
  }
  // explorer.exe answers 1 even when it worked: the outcome is not checked.
  execFile(
    'explorer.exe',
    explorerArgs(clean, stat.isDirectory()),
    { windowsVerbatimArguments: true },
    () => {},
  );
  return true;
}
