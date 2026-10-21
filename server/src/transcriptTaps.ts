/** Something that wants to see every parsed transcript record (the office's
 *  hook health reads Claude Code's hook-failure attachments). Kept apart from
 *  transcriptParser so the parser only has to call tapRecord. */
type RecordTap = (agentId: number, record: unknown) => void;

let tap: RecordTap | null = null;

export function setRecordTap(next: RecordTap | null): void {
  tap = next;
}

/** Called by transcriptParser for each record; never throws into it. */
export function tapRecord(agentId: number, record: unknown): void {
  try {
    tap?.(agentId, record);
  } catch {
    /* a tap must not break transcript reading */
  }
}
