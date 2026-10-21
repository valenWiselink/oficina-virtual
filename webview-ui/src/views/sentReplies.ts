import { useSyncExternalStore } from 'react';

/**
 * The one-tap reply you sent an agent ("Dale, seguí", "1 · Solo el
 * dropdown"), so its button shows ✓ instead of going grey like the rest —
 * WhatsApp's tick: it reached the terminal. Kept outside the card, because
 * the card itself moves column (a "te toca" answered goes to "Terminó") and
 * mounts anew. It lasts until the agent's session writes again (it read the
 * message and got going): compared by its own `lastRecordAt`, never a clock.
 */
interface SentReply {
  key: string;
  /** The agent's lastRecordAt when it went out. */
  recordAt: number | undefined;
}

const sent = new Map<number, SentReply>();
const listeners = new Set<() => void>();

export function markReplySent(agentId: number, key: string, recordAt: number | undefined): void {
  sent.set(agentId, { key, recordAt });
  for (const l of listeners) l();
}

/** The key of the reply still marked, if any (pure, for the tests). */
export function stillSent(
  reply: SentReply | undefined,
  lastRecordAt: number | undefined,
): string | undefined {
  return reply && reply.recordAt === lastRecordAt ? reply.key : undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Which of this agent's reply buttons carries the ✓. */
export function useSentReply(
  agentId: number,
  lastRecordAt: number | undefined,
): string | undefined {
  const reply = useSyncExternalStore(subscribe, () => sent.get(agentId));
  return stillSent(reply, lastRecordAt);
}
