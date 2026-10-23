/**
 * Who a turn is for: Valentín (he wrote or spoke to the agent) or the office
 * (an «[Oficina] …» notice, a supervisor's note, a background job reporting
 * back). Jarvis reads aloud only what answers him (asked 2026-10-23: «no
 * quiero escuchar nunca» the answers to the office's notices).
 *
 * A turn starts with a user record; what he sends while it works is absorbed
 * into that turn (a `queued_command` attachment), so it makes the turn his
 * too — the answer at its end is for him.
 */

import { userItem, userText } from '../agentChat.js';
import type { AgentState } from '../types.js';

export type PromptAuthor = 'valentin' | 'office';

/** Who wrote one prompt; undefined when it is no prompt at all (harness
 *  output, a caveat, empty). */
export function promptAuthor(raw: string): PromptAuthor | undefined {
  // A background job reporting back starts a turn nobody typed.
  if (raw.trimStart().startsWith('<task-notification>')) return 'office';
  const text = userText(raw);
  if (!text) return undefined;
  return userItem('', text, undefined).role === 'user' ? 'valentin' : 'office';
}

/** Who wrote the prompts of a record: his if any part is his. */
function authorOf(texts: readonly string[]): PromptAuthor | undefined {
  let found: PromptAuthor | undefined;
  for (const t of texts) {
    const who = promptAuthor(t);
    if (who === 'valentin') return who;
    found ??= who;
  }
  return found;
}

/** The prompt texts of a main-chain user record (tool results are not prompts). */
function promptTexts(record: Record<string, unknown>): string[] {
  const content = (record.message as { content?: unknown } | undefined)?.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return (content as Array<Record<string, unknown>>).flatMap((b) =>
    b.type === 'text' && typeof b.text === 'string' ? [b.text] : [],
  );
}

/** Follow who the current turn is for; true when that changed. */
export function observeTurnAuthor(agent: AgentState, record: Record<string, unknown>): boolean {
  if (record.isSidechain === true || record.isMeta === true || record.isCompactSummary === true) {
    return false;
  }
  const before = agent.turnByValentin === true;
  if (record.type === 'user') {
    const who = authorOf(promptTexts(record));
    if (who) agent.turnByValentin = who === 'valentin';
  } else if (record.type === 'attachment') {
    const queued = record.attachment as Record<string, unknown> | undefined;
    if (queued?.type === 'queued_command' && typeof queued.prompt === 'string') {
      if (promptAuthor(queued.prompt) === 'valentin') agent.turnByValentin = true;
    }
  }
  return before !== (agent.turnByValentin === true);
}
