import * as fsp from 'fs/promises';
import * as path from 'path';

const CHUNK_BYTES = 1024 * 1024;
/** Longer lines are not ours (an Artifact call or answer names a file, not its bytes). */
const LINE_MAX_BYTES = 16 * 1024 * 1024;
const NEWLINE = 10;
const WALK_DEPTH = 6;

/** Every marker a line we want has; most of a transcript has none of them. */
const MARKERS = ['rtifact', '-title"'];

export interface TranscriptFile {
  file: string;
  size: number;
}

/** Every `.jsonl` under a transcripts root, sub-agents' and workflows' included. */
export async function listTranscripts(dir: string, depth = WALK_DEPTH): Promise<TranscriptFile[]> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: TranscriptFile[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0) found.push(...(await listTranscripts(full, depth - 1)));
    } else if (entry.name.endsWith('.jsonl')) {
      try {
        found.push({ file: full, size: (await fsp.stat(full)).size });
      } catch {
        // Gone since the listing (Claude Code cleans old sessions up).
      }
    }
  }
  return found;
}

function hasMarker(buffer: Buffer): boolean {
  return MARKERS.some((marker) => buffer.includes(marker));
}

function eachWantedLine(complete: Buffer, onLine: (line: string) => void): void {
  if (!hasMarker(complete)) return;
  let start = 0;
  while (start < complete.length) {
    let end = complete.indexOf(NEWLINE, start);
    if (end === -1) end = complete.length;
    const line = complete.subarray(start, end);
    if (line.length <= LINE_MAX_BYTES && hasMarker(line)) onLine(line.toString('utf-8'));
    start = end + 1;
  }
}

/**
 * The complete lines after byte `from` that may interest us, in order, and the
 * byte to continue from (a half-written last line waits for the next read).
 * Awaits between chunks, so a many-gigabyte first read never holds the server.
 */
export async function readNewLines(
  file: string,
  from: number,
  onLine: (line: string) => void,
): Promise<number> {
  const handle = await fsp.open(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(CHUNK_BYTES);
    let position = from;
    let consumed = from;
    let held: Buffer = Buffer.alloc(0);
    let skipping = false;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_BYTES, position);
      if (bytesRead === 0) return consumed;
      position += bytesRead;
      const read = chunk.subarray(0, bytesRead);
      const lastNewline = read.lastIndexOf(NEWLINE);
      if (lastNewline === -1) {
        if (skipping) continue;
        held = Buffer.concat([held, read]);
        if (held.length > LINE_MAX_BYTES) {
          skipping = true;
          held = Buffer.alloc(0);
        }
        continue;
      }
      if (skipping) {
        // Past the end of the line too long to keep: resume after it.
        skipping = false;
        eachWantedLine(read.subarray(read.indexOf(NEWLINE) + 1, lastNewline + 1), onLine);
      } else {
        eachWantedLine(Buffer.concat([held, read.subarray(0, lastNewline + 1)]), onLine);
      }
      consumed = position - (bytesRead - lastNewline - 1);
      held = Buffer.from(read.subarray(lastNewline + 1));
    }
  } finally {
    await handle.close();
  }
}
