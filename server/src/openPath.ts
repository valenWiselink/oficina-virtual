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
