import * as fs from 'fs';

import { pathsMatch } from './pathKey.js';

/**
 * Whether a session now writes its conversation in another file than the one
 * the office follows. A session that moved into another folder (a worktree)
 * writes under that folder's project, and an office restart resumes it with
 * the path of the folder it was launched in: «pentatuel» (2026-10-22) ended
 * turn after turn and the office never read a word of it. Claude's hooks say
 * where it writes (`transcript_path`); follow that file when the followed one
 * is gone or older.
 */
export function transcriptMoved(followed: string, reported: string | undefined): boolean {
  if (!reported || !followed || pathsMatch(followed, reported)) return false;
  const reportedAt = mtimeOf(reported);
  if (reportedAt === undefined) return false;
  const followedAt = mtimeOf(followed);
  return followedAt === undefined || reportedAt > followedAt;
}

function mtimeOf(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}
