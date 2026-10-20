/**
 * The recaps Claude Code writes into a session's transcript (the "※ recap"
 * shown after a while away: `{type: 'system', subtype: 'away_summary'}`),
 * read back for the day's history: they say what a session achieved better
 * than any one answer. Only today's transcripts, and only their tail, so a
 * day of long sessions stays cheap to read.
 */

import * as fs from 'fs';
import * as path from 'path';

/** How much of a transcript's end is read for recaps (they come every so often). */
const TAIL_BYTES = 2 * 1024 * 1024;

export interface TranscriptRecap {
  at: number;
  text: string;
  sessionId: string;
  cwd?: string;
}

export interface TranscriptRecaps {
  recaps: TranscriptRecap[];
  /** The session's name in Claude Code (/rename, else its automatic title). */
  title?: string;
}

/** Top-level transcripts (not subagents') written to on `day` (local AAAA-MM-DD). */
export function transcriptsOfDay(
  projectsDir: string,
  day: string,
  dayOf: (ms: number) => string,
): string[] {
  let projects: string[];
  try {
    projects = fs.readdirSync(projectsDir);
  } catch {
    return [];
  }
  return projects.flatMap((project) => {
    const dir = path.join(projectsDir, project);
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(dir, f))
        .filter((f) => dayOf(fs.statSync(f).mtimeMs) === day);
    } catch {
      return [];
    }
  });
}

/** The recaps of `day` in the tail of one transcript, oldest first. */
export function readRecaps(
  file: string,
  day: string,
  dayOf: (ms: number) => string,
): TranscriptRecaps {
  const out: TranscriptRecaps = { recaps: [] };
  let text: string;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      text = buf.toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return out;
  }
  let customTitle: string | undefined;
  let aiTitle: string | undefined;
  for (const line of text.split('\n')) {
    const wanted =
      line.includes('"away_summary"') ||
      line.includes('"custom-title"') ||
      line.includes('"ai-title"');
    if (!wanted || !line.startsWith('{')) continue;
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (r.type === 'custom-title' && typeof r.customTitle === 'string') customTitle = r.customTitle;
    else if (r.type === 'ai-title' && typeof r.aiTitle === 'string') aiTitle = r.aiTitle;
    else if (r.type === 'system' && r.subtype === 'away_summary' && r.isSidechain !== true) {
      const at = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
      if (Number.isNaN(at) || dayOf(at) !== day || typeof r.content !== 'string') continue;
      if (!r.content.trim() || typeof r.sessionId !== 'string') continue;
      out.recaps.push({
        at,
        text: r.content.trim(),
        sessionId: r.sessionId,
        cwd: typeof r.cwd === 'string' ? r.cwd : undefined,
      });
    }
  }
  // The office names its background sessions "oficina-<name>-<hex>": that is
  // no title to tell the session by.
  const ownName = customTitle && /^oficina-.+-[0-9a-f]{4}$/.test(customTitle);
  out.title = (ownName ? undefined : customTitle) ?? aiTitle ?? customTitle;
  return out;
}
