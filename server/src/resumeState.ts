/**
 * Where a session was left when the office picks it up mid-way (restored on
 * start, or adopted): the stream only reads what comes next, so a session
 * that had finished its turn would show as "Sin tarea" (and fall asleep)
 * instead of "Terminó" / "Te toca" — measured 2026-10-20 after a reinstall.
 */

import * as fs from 'fs';

/** Records that say nothing about whose turn it is. */
const NEUTRAL = new Set([
  'custom-title',
  'ai-title',
  'summary',
  'file-history-snapshot',
  'last-prompt',
  'permission-mode',
  'queue-operation',
]);

/** True when the newest turn-relevant record of the main conversation closes
 *  a turn: a turn_duration, or an answer with no tool call pending. */
export function endedWaiting(lines: readonly string[]): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('{')) continue;
    let r: {
      type?: string;
      subtype?: string;
      isSidechain?: boolean;
      isMeta?: boolean;
      message?: { content?: unknown };
    };
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.isSidechain === true || r.isMeta === true || !r.type || NEUTRAL.has(r.type)) continue;
    if (r.type === 'system') {
      if (r.subtype === 'turn_duration') return true;
      continue;
    }
    if (r.type === 'assistant') {
      const content = Array.isArray(r.message?.content)
        ? (r.message.content as Array<{ type?: string }>)
        : [];
      return !content.some((c) => c.type === 'tool_use');
    }
    if (r.type === 'user') return false;
  }
  return false;
}

/** The last `bytes` of a transcript as lines (the first, likely cut, dropped). */
export function tailLines(file: string, bytes: number): string[] {
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - bytes);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(size - start);
      const n = fs.readSync(fd, buf, 0, buf.length, start);
      const lines = buf.subarray(0, n).toString('utf-8').split('\n');
      return start > 0 ? lines.slice(1) : lines;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}
