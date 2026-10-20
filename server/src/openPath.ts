/**
 * "Open" a path clicked in an agent's terminal or chat: a folder opens in the
 * Explorer, a document (a .sql, a .md, a PDF, an image…) opens in its usual
 * app, and any other file is shown selected in its folder. Never run: the
 * text is untrusted (an agent can print the path of a .bat), so only kinds
 * that cannot execute open directly. Windows only, like the folder picker.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Files a click opens in their app: plain documents, nothing that runs
 *  (no .js, .ps1, .bat, .exe, .lnk, .url, .hta…). */
const DOCUMENTS = new Set([
  '.md',
  '.txt',
  '.log',
  '.sql',
  '.json',
  '.csv',
  '.yml',
  '.yaml',
  '.xml',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.mp3',
  '.wav',
  '.xlsx',
  '.docx',
  '.pptx',
  '.html',
  '.htm',
]);

/** What a click does with an existing path. */
export function openMode(target: string, isDirectory: boolean): 'folder' | 'open' | 'select' {
  if (isDirectory) return 'folder';
  return DOCUMENTS.has(path.win32.extname(target).toLowerCase()) ? 'open' : 'select';
}

/**
 * explorer.exe's command line: the folder or document itself, or the file to
 * select. It is passed verbatim with the path in quotes, the one form explorer
 * reads right: Node's own quoting wraps the whole "/select,…" and a path with
 * spaces then opened Documents instead (measured 2026-10-20). A Windows path
 * cannot contain a quote, so nothing escapes it.
 */
export function explorerArgs(target: string, mode: 'folder' | 'open' | 'select'): string[] {
  return mode === 'select' ? [`/select,"${target}"`] : [`"${target}"`];
}

/** Folders never worth looking into for an agent's file (big, generated). */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'coverage']);
/** How deep and how many folders a lookup walks before giving up. */
const LOOKUP_DEPTH = 4;
const LOOKUP_MAX_DIRS = 4000;

/**
 * A clicked path as an absolute one: as is when it already is, else the
 * newest match under the agent's folder, walking a few levels down — its
 * repos and worktrees too (an agent in "development" named
 * "migrations/x.sql" of .worktrees\metrics-WISE-4628 — measured 2026-10-20).
 * Unknown stays unknown (openInExplorer refuses it).
 */
export function resolveLocalPath(target: unknown, cwd: string | undefined): unknown {
  if (typeof target !== 'string') return target;
  const clean = target.trim().replace(/^\.[\\/]/, '');
  if (/^[A-Za-z]:[\\/]/.test(clean) || !cwd || clean.split(/[\\/]/).includes('..')) return target;
  let best: { file: string; mtime: number } | undefined;
  let queue: string[] = [cwd];
  let walked = 0;
  for (let depth = 0; depth <= LOOKUP_DEPTH && queue.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of queue) {
      if (++walked > LOOKUP_MAX_DIRS) break;
      const candidate = path.win32.join(dir, clean);
      try {
        const mtime = fs.statSync(candidate).mtimeMs;
        if (!best || mtime > best.mtime) best = { file: candidate, mtime };
      } catch {
        /* not here */
      }
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
            next.push(path.join(dir, entry.name));
          }
        }
      } catch {
        /* unreadable: skip it */
      }
    }
    queue = next;
  }
  return best?.file ?? target;
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
    explorerArgs(clean, openMode(clean, stat.isDirectory())),
    { windowsVerbatimArguments: true },
    () => {},
  );
  return true;
}
