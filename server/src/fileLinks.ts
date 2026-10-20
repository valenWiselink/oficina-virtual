import * as path from 'path';

import { toPathKey } from './pathKey.js';

/** What a tool call does to a file, when it touches one. */
export interface FileOp {
  op: 'read' | 'write';
  path: string;
}

/** Read/Write/Edit-family tool input → the file it touches, or null. */
export function fileOpOf(
  toolName: string,
  input: Record<string, unknown> | undefined,
): FileOp | null {
  const filePath = input?.file_path ?? input?.notebook_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (toolName === 'Read') return { op: 'read', path: filePath };
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    return { op: 'write', path: filePath };
  }
  return null;
}

/** A hand-off inside a meeting: one subagent read what another wrote. */
export interface FileLink {
  leadId: number;
  fromParentToolId: string;
  toParentToolId: string;
  fileName: string;
}

/**
 * Who wrote what, per lead, so a subagent reading a file another subagent of
 * the same lead wrote is reported as a hand-off. Only real reads of real
 * writes count — no guessing from names or timing.
 */
export class FileLinkTracker {
  private readonly writers = new Map<number, Map<string, string>>();

  /** Record one subagent file op; returns the hand-off it reveals, if any. */
  observe(leadId: number, spawnToolUseId: string, fileOp: FileOp): FileLink | null {
    let byPath = this.writers.get(leadId);
    if (!byPath) {
      byPath = new Map();
      this.writers.set(leadId, byPath);
    }
    const key = toPathKey(fileOp.path);
    if (fileOp.op === 'write') {
      byPath.set(key, spawnToolUseId);
      return null;
    }
    const writer = byPath.get(key);
    if (!writer || writer === spawnToolUseId) return null;
    return {
      leadId,
      fromParentToolId: writer,
      toParentToolId: spawnToolUseId,
      fileName: path.basename(fileOp.path),
    };
  }

  /** The lead's session ended: its meeting's history goes with it. */
  forgetLead(leadId: number): void {
    this.writers.delete(leadId);
  }
}
